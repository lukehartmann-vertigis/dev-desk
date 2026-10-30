import { z } from 'zod';
import {
	matchesBoardArea,
	prViewSchema,
	referenceSchema,
	referenceUrl,
	swimlaneScopeSchema,
	teamBoardSchema,
	workSchema,
} from '../lib/contracts';
import type {
	BoardScope,
	PullRequest,
	Reference,
	Repository,
	Snapshot,
	TeamBoard,
	WorkItem,
} from '../lib/contracts';
import type { Configuration } from './config';
import {
	saveSettingsSchema,
	sourceSchema,
	type SaveSettings,
	type Source,
	type SourceSettings,
} from '../lib/contracts/settings';
import { discoverSources, resolveSource } from './azure-discovery';
import { readSettings, writeSettings } from './settings';
import { AppError, log, safeError } from './errors';
import { snapshots } from './schema';
import { meta, setMeta, type Store } from './store';
import { requestAzure, type AzureRequestOptions } from './azure-http';
import { loadSwimlanes } from './azure-swimlanes';

const object = z.record(z.string(), z.unknown());
const collection = z.object({ value: z.array(object) });
const identity = z.object({
	id: z.string(),
	displayName: z.string().optional(),
	descriptor: z.string().optional(),
	vote: z.number().optional(),
	isRequired: z.boolean().optional(),
	isContainer: z.boolean().optional(),
});
const prSchema = z.object({
	pullRequestId: z.number(),
	title: z.string(),
	isDraft: z.boolean().optional(),
	createdBy: identity,
	reviewers: z.array(identity),
});
type RawPr = z.infer<typeof prSchema>;
const teamMappingSchema = z.object({
	board: teamBoardSchema,
	successAt: z.string().nullable(),
	error: z.string().nullable(),
});
const swimlaneMappingSchema = swimlaneScopeSchema.omit({ stale: true });

/**
 * Applies personal/group review semantics: personal non-approval takes precedence;
 * group-only requests disappear only when every relevant group approves.
 * Missing group votes throw INCOMPLETE rather than inventing a review result.
 */
export function needsReview(pr: RawPr, userId: string, groups: Set<string>) {
	const personal = pr.reviewers.find((reviewer) => reviewer.id === userId);
	if (personal?.vote === 5 || personal?.vote === 10) {
		return false;
	}
	if (personal) {
		return true;
	}
	const relevant = pr.reviewers.filter(
		(reviewer) =>
			groups.has(reviewer.id) || (reviewer.descriptor && groups.has(reviewer.descriptor)),
	);
	if (relevant.some((reviewer) => reviewer.vote === undefined)) {
		throw new AppError('INCOMPLETE', 'A reviewer group vote is unavailable.', 502);
	}
	return (
		relevant.length > 0 &&
		!relevant.every((reviewer) => reviewer.vote === 5 || reviewer.vote === 10)
	);
}

/** Owns scoped read-only synchronization, independent last-good caches, and reference validation. */
export class Azure {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private active: Promise<void> | undefined;
	private abort: AbortController | undefined;
	private stopped = false;
	private userId: string | undefined;
	private refreshAgain = false;
	/** Retains injected dependencies without I/O; refresh starts work and stop ends scheduling. */
	constructor(
		private store: Store,
		private config: Configuration,
		private transport: typeof fetch = fetch,
	) {}
	/** True while a full refresh is active, including concurrent callers sharing that refresh. */
	get running() {
		return Boolean(this.active);
	}
	/** Current durable selection, independent of connection availability. */
	get selection() {
		const selection = readSettings(this.store, this.config.adoOrganization);
		for (const kind of ['boards', 'repositories'] as const) {
			selection[kind] = selection[kind].map((source) => {
				const cached = meta(this.store, this.scopeKey(`source:${kind}:${source.id}`));
				if (!cached) {
					return source;
				}
				const resolved = sourceSchema.parse(JSON.parse(cached));
				return resolved.id === source.id && resolved.projectId === source.projectId
					? resolved
					: source;
			});
		}
		return selection;
	}
	/** Selected repository labels survive restart and unavailable-source failures. */
	get repositories(): Repository[] {
		return this.selection.repositories.map(({ id, project, name }) => ({ id, project, name }));
	}
	private workProjects() {
		return [
			...new Map(this.selection.boards.map((source) => [source.projectId, source])).values(),
		];
	}
	/** Rejects superseded async results before they can expose data or commit a mutation. */
	assertRevision(revision: number) {
		if (this.stopped || this.selection.revision !== revision) {
			throw new AppError(
				'SETTINGS_CHANGED',
				'Azure DevOps sources changed. Retry with the current selection.',
				409,
			);
		}
	}
	/** Loads catalog metadata only; discovery never changes enabled sources. */
	discover(signal: AbortSignal) {
		this.settings();
		return discoverSources(
			(path, options) => this.request(path, options),
			AbortSignal.any([signal, AbortSignal.timeout(120000)]),
		);
	}
	/** Validates additions outside the transaction and atomically saves both source lists. */
	async saveSelection(input: SaveSettings, signal: AbortSignal) {
		const command = saveSettingsSchema.parse(input);
		const previous = this.selection;
		this.assertRevision(command.revision);
		const deadline = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
		const next: SourceSettings = { ...previous, boards: [], repositories: [] };
		const mappings: { source: Source; board: TeamBoard }[] = [];
		const additions: { kind: 'boards' | 'repositories'; source: Source }[] = [];
		for (const kind of ['boards', 'repositories'] as const) {
			for (const identity of command[kind]) {
				const retained = previous[kind].find(
					(source) =>
						source.id === identity.id && source.projectId === identity.projectId,
				);
				if (retained) {
					next[kind].push(retained);
					continue;
				}
				const source = await resolveSource(
					(path, options) => this.request(path, options),
					kind,
					identity,
					deadline,
				);
				if (kind === 'boards') {
					mappings.push({ source, board: await this.teamAreas(source, deadline) });
				}
				next[kind].push(source);
				additions.push({ kind, source });
			}
		}
		this.assertRevision(command.revision);
		if (deadline.aborted) {
			throw new AppError('CANCELLED', 'Settings save was cancelled.', 409);
		}
		const committed = this.store.db.transaction(() => {
			const result = writeSettings(this.store, next);
			for (const { source, board } of mappings) {
				this.saveTeam(source, board, null);
			}
			for (const { kind, source } of additions) {
				setMeta(
					this.store,
					this.scopeKey(`source:${kind}:${source.id}`),
					JSON.stringify(source),
				);
			}
			return result;
		});
		if (this.config.ado) {
			if (this.active) {
				this.refreshAgain = true;
			} else {
				void this.refresh();
			}
		}
		return committed;
	}
	private settings() {
		if (!this.config.ado) {
			throw new AppError('ADO_DISABLED', this.config.adoStatus.message, 503);
		}
		return this.config.ado;
	}
	private async request(path: string, options: AzureRequestOptions = {}) {
		return requestAzure(this.settings(), path, options, this.transport);
	}
	private scopeKey(scope: string) {
		return `${this.config.adoOrganization.toLowerCase()}:${scope}`;
	}
	private save(scope: string, dataset: Snapshot['dataset'], data: WorkItem[] | PullRequest[]) {
		scope = this.scopeKey(scope);
		this.store.db
			.insert(snapshots)
			.values({
				scope,
				dataset,
				data: JSON.stringify(data),
				successAt: new Date().toISOString(),
				error: null,
			})
			.onConflictDoUpdate({
				target: snapshots.scope,
				set: {
					data: JSON.stringify(data),
					successAt: new Date().toISOString(),
					error: null,
				},
			})
			.run();
	}
	private fail(scope: string, dataset: Snapshot['dataset'], error: unknown) {
		scope = this.scopeKey(scope);
		const safe = safeError(error);
		log('ado.scope_failed', 'error', { scope, code: safe.code });
		this.store.db
			.insert(snapshots)
			.values({ scope, dataset, data: '[]', successAt: null, error: safe.message })
			.onConflictDoUpdate({ target: snapshots.scope, set: { error: safe.message } })
			.run();
	}
	/** Reads configured last-good datasets locally, normalizing legacy work metadata and freshness. */
	read(): Snapshot[] {
		const cfg = this.config.ado;
		if (!cfg) {
			return [];
		}
		const projects = this.workProjects();
		const boards = this.readBoards();
		const repositories = this.repositories;
		const scopes = new Set([
			...projects.map((project) => this.scopeKey(`work:${project.projectId}`)),
			...repositories.flatMap(({ id }) => [
				this.scopeKey(`own:${id}`),
				this.scopeKey(`reviews:${id}`),
			]),
		]);
		return this.store.db
			.select()
			.from(snapshots)
			.all()
			.filter((row) => scopes.has(row.scope))
			.map((row) => {
				const project = projects.find(
					(project) => row.scope === this.scopeKey(`work:${project.projectId}`),
				);
				const mapping = boards.find((scope) => scope.project === project?.project);
				return {
					...row,
					dataset: z.enum(['work', 'reviews', 'own']).parse(row.dataset),
					data:
						row.dataset === 'work'
							? z
									.array(workSchema)
									.parse(JSON.parse(row.data))
									.filter((item) => {
										const areaPath = item.areaPath;
										return (
											areaPath !== null &&
											Boolean(
												mapping?.boards.some((board) =>
													board.areas.some((area) =>
														matchesBoardArea(areaPath, area),
													),
												),
											)
										);
									})
							: z
									.array(prViewSchema)
									.parse(JSON.parse(row.data))
									.filter((item) =>
										repositories.some(
											(repo) =>
												repo.id === item.repositoryId &&
												repo.project.toLowerCase() ===
													item.project.toLowerCase(),
										),
									),
					stale:
						Boolean(row.error || mapping?.stale) ||
						!row.successAt ||
						Date.now() - Date.parse(row.successAt) > cfg.interval * 2000,
				};
			});
	}
	/** Reads local team mappings, distinguishing never synchronized from a successful empty mapping. */
	readBoards(): BoardScope[] {
		const cfg = this.config.ado;
		if (!cfg) {
			return [];
		}
		const sources = this.selection.boards;
		return this.workProjects().map((project) => {
			const mappings = sources
				.filter((source) => source.projectId === project.projectId)
				.map((source) => {
					const saved = meta(
						this.store,
						this.scopeKey(`team:${source.projectId}:${source.id}`),
					);
					return saved
						? teamMappingSchema.parse(JSON.parse(saved))
						: {
								board: { id: source.id, name: source.name, areas: [] },
								successAt: null,
								error: 'Selected team scope has not been synchronized.',
							};
				});
			const successes = mappings
				.flatMap((mapping) => (mapping.successAt ? [mapping.successAt] : []))
				.sort();
			const successAt = successes[0] ?? null;
			const error =
				mappings
					.map((mapping) => mapping.error)
					.filter(Boolean)
					.join(' ') || null;
			return {
				project: project.project,
				boards: mappings.map((mapping) => mapping.board),
				swimlanes: Object.fromEntries(
					sources
						.filter((source) => source.projectId === project.projectId)
						.map((source) => {
							const saved = meta(
								this.store,
								this.scopeKey(`swimlanes:${source.projectId}:${source.id}`),
							);
							const mapping = saved
								? swimlaneMappingSchema.parse(JSON.parse(saved))
								: {
										boards: [],
										itemIds: [],
										successAt: null,
										error: 'Swimlane mapping has not been synchronized.',
									};
							return [
								source.id,
								{
									...mapping,
									stale:
										Boolean(mapping.error) ||
										!mapping.successAt ||
										Date.now() - Date.parse(mapping.successAt) >
											cfg.interval * 2000,
								},
							];
						}),
				),
				successAt,
				error,
				stale:
					Boolean(error) ||
					!successAt ||
					Date.now() - Date.parse(successAt) > cfg.interval * 2000,
			};
		});
	}
	private async teamAreas(source: Source, signal: AbortSignal): Promise<TeamBoard> {
		const data = z
			.object({
				field: z.object({ referenceName: z.literal('System.AreaPath') }),
				values: z.array(
					z.object({ value: z.string().min(1), includeChildren: z.boolean() }),
				),
			})
			.parse(
				(
					await this.request(
						`${source.projectId}/${source.id}/_apis/work/teamsettings/teamfieldvalues`,
						{ signal },
					)
				).data,
			);
		return {
			id: source.id,
			name: source.name,
			areas: data.values.map((value) => ({
				path: value.value,
				includeChildren: value.includeChildren,
			})),
		};
	}
	private saveTeam(source: Source, board: TeamBoard, error: string | null) {
		const key = this.scopeKey(`team:${source.projectId}:${source.id}`);
		const saved = meta(this.store, key);
		const previous = saved ? teamMappingSchema.parse(JSON.parse(saved)) : undefined;
		setMeta(
			this.store,
			key,
			JSON.stringify({
				board: error ? (previous?.board ?? board) : board,
				successAt: error ? (previous?.successAt ?? null) : new Date().toISOString(),
				error,
			}),
		);
	}
	/**
	 * Coalesces concurrent refreshes under one 120s deadline, then schedules the next interval.
	 * Scope failures retain last-good data with errors; disabled/stopped service calls throw.
	 */
	refresh() {
		if (!this.config.ado || this.stopped) {
			throw new AppError('ADO_DISABLED', this.config.adoStatus.message, 503);
		}
		if (this.active) {
			return this.active;
		}
		clearTimeout(this.timer);
		this.abort = new AbortController();
		const selection = this.selection;
		this.active = this.sync(
			selection,
			AbortSignal.any([this.abort.signal, AbortSignal.timeout(120000)]),
		)
			.catch((error: unknown) => {
				if (this.selection.revision !== selection.revision) {
					log('ado.refresh_superseded', 'info');
					return;
				}
				for (const { projectId } of selection.boards) {
					this.fail(`work:${projectId}`, 'work', error);
				}
				for (const { id } of selection.repositories) {
					this.fail(`own:${id}`, 'own', error);
					this.fail(`reviews:${id}`, 'reviews', error);
				}
			})
			.finally(() => {
				this.active = undefined;
				if (!this.stopped) {
					if (this.refreshAgain) {
						this.refreshAgain = false;
						void this.refresh();
						return;
					}
					this.timer = setTimeout(() => {
						void this.refresh();
					}, this.settings().interval * 1000);
				}
			});
		return this.active;
	}
	/** Permanently stops scheduling, aborts current network work, and awaits its cache bookkeeping. */
	async stop() {
		this.stopped = true;
		clearTimeout(this.timer);
		this.abort?.abort();
		await this.active;
	}
	private async groups(signal: AbortSignal) {
		const descriptor = z.string().parse(
			(
				await this.request(`_apis/graph/descriptors/${this.userId}`, {
					graph: true,
					signal,
				})
			).data.value,
		);
		if (this.settings().email) {
			const user = (
				await this.request(`_apis/graph/users/${encodeURIComponent(descriptor)}`, {
					graph: true,
					signal,
				})
			).data;
			if (
				![user.mailAddress, user.principalName].some(
					(email) =>
						typeof email === 'string' &&
						email.toLowerCase() === this.settings().email?.toLowerCase(),
				)
			) {
				throw new AppError(
					'IDENTITY_MISMATCH',
					'The configured email does not match the PAT identity.',
					502,
				);
			}
		}
		const queue = [descriptor];
		const visited = new Set<string>();
		const groups = new Set<string>();
		while (queue.length) {
			const subject = queue.shift();
			if (!subject || visited.has(subject)) {
				continue;
			}
			if (visited.size >= 2000) {
				throw new AppError(
					'INCOMPLETE',
					'Group traversal reached its safety limit. Review data is incomplete.',
					502,
				);
			}
			visited.add(subject);
			const response = await this.request(
				`_apis/graph/memberships/${encodeURIComponent(subject)}?direction=up&depth=1`,
				{ graph: true, signal },
			);
			if (response.continuation) {
				throw new AppError(
					'INCOMPLETE',
					'Graph returned an unsupported continuation. Group membership is incomplete.',
					502,
				);
			}
			for (const membership of collection.parse(response.data).value) {
				const parent = z.string().parse(membership.containerDescriptor);
				if (!groups.has(parent)) {
					groups.add(parent);
					groups.add(
						z
							.string()
							.parse(
								(
									await this.request(
										`_apis/graph/storagekeys/${encodeURIComponent(parent)}`,
										{ graph: true, signal },
									)
								).data.value,
							),
					);
					queue.push(parent);
				}
			}
		}
		return groups;
	}
	private async work(
		project: Source,
		areas: TeamBoard['areas'],
		signal: AbortSignal,
	): Promise<WorkItem[]> {
		if (!areas.length) {
			return [];
		}
		const areaQuery = areas
			.map(
				(area) =>
					`[System.AreaPath] ${area.includeChildren ? 'UNDER' : '='} '${area.path.replaceAll("'", "''")}'`,
			)
			.join(' OR ');
		const items: WorkItem[] = [];
		let after = 0;
		for (let page = 0; page < 200; page++) {
			const result = await this.request(`${project.projectId}/_apis/wit/wiql?$top=1000`, {
				signal,
				body: {
					query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND (${areaQuery}) AND [System.Id] > ${after} ORDER BY [System.Id]`,
				},
			});
			const ids = z
				.array(z.object({ id: z.number().int().positive() }))
				.parse(result.data.workItems)
				.map((item) => item.id);
			if (ids.some((id, index) => id <= (index ? (ids[index - 1] ?? after) : after))) {
				throw new AppError('INCOMPLETE', 'Work-item paging did not advance.', 502);
			}
			for (let offset = 0; offset < ids.length; offset += 200) {
				const batch = ids.slice(offset, offset + 200);
				const values = collection.parse(
					(
						await this.request(`${project.projectId}/_apis/wit/workitemsbatch`, {
							signal,
							body: {
								ids: batch,
								errorPolicy: 'Fail',
								fields: [
									'System.Title',
									'System.WorkItemType',
									'System.State',
									'Microsoft.VSTS.Common.Priority',
									'System.AreaPath',
									'System.AssignedTo',
									'System.TeamProject',
								],
							},
						})
					).data,
				).value;
				if (values.length !== batch.length) {
					throw new AppError(
						'INCOMPLETE',
						'Some assigned work items were not returned.',
						502,
					);
				}
				const returned = new Set<number>();
				for (const value of values) {
					const fields = object.parse(value.fields);
					const id = z.number().int().positive().parse(value.id);
					if (!batch.includes(id) || returned.has(id)) {
						throw new AppError(
							'INCOMPLETE',
							'Work-item batch identities did not match the query.',
							502,
						);
					}
					returned.add(id);
					const areaPath =
						typeof fields['System.AreaPath'] === 'string'
							? fields['System.AreaPath']
							: null;
					const assigned = identity.safeParse(fields['System.AssignedTo']);
					if (
						typeof fields['System.TeamProject'] !== 'string' ||
						fields['System.TeamProject'].toLowerCase() !==
							project.project.toLowerCase() ||
						!areaPath ||
						!areas.some((area) => matchesBoardArea(areaPath, area)) ||
						!assigned.success ||
						assigned.data.id !== this.userId
					) {
						continue;
					}
					items.push({
						id,
						project: project.project,
						title: z.string().parse(fields['System.Title']),
						type: z.string().parse(fields['System.WorkItemType']),
						state: z.string().parse(fields['System.State']),
						priority:
							typeof fields['Microsoft.VSTS.Common.Priority'] === 'number'
								? fields['Microsoft.VSTS.Common.Priority']
								: null,
						areaPath,
						url: this.url({
							kind: 'workItem',
							organization: this.settings().org,
							project: project.project,
							id,
						}),
					});
				}
			}
			if (ids.length < 1000) {
				return items;
			}
			after = z.number().parse(ids.at(-1));
		}
		throw new AppError('INCOMPLETE', 'Work-item query reached its paging safety limit.', 502);
	}
	private async pullRequests(repo: Repository, signal: AbortSignal) {
		const result: RawPr[] = [];
		for (let page = 0; page < 200; page++) {
			const rows = z
				.array(prSchema)
				.parse(
					(
						await this.request(
							`${encodeURIComponent(repo.project)}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=active&$top=100&$skip=${page * 100}`,
							{ signal },
						)
					).data.value,
				);
			result.push(...rows);
			if (rows.length < 100) {
				return result;
			}
		}
		throw new AppError('INCOMPLETE', 'PR paging reached its safety limit.', 502);
	}
	private async sync(selection: SourceSettings, signal: AbortSignal) {
		if (!selection.boards.length && !selection.repositories.length) {
			return;
		}
		const cfg = this.settings();
		const userId = await this.identify(signal);
		this.assertRevision(selection.revision);
		let groupIds: Set<string> | undefined;
		let groupError: unknown;
		if (selection.repositories.length || cfg.email) {
			try {
				groupIds = await this.groups(signal);
			} catch (error) {
				groupError = error;
			}
		}
		if (cfg.email && groupError) {
			throw groupError;
		}
		for (const selected of selection.boards) {
			try {
				const source = await resolveSource(
					(path, options) => this.request(path, options),
					'boards',
					selected,
					signal,
				);
				const board = await this.teamAreas(source, signal);
				this.assertRevision(selection.revision);
				setMeta(
					this.store,
					this.scopeKey(`source:boards:${source.id}`),
					JSON.stringify(source),
				);
				this.saveTeam(source, board, null);
			} catch (error) {
				this.assertRevision(selection.revision);
				this.saveTeam(
					selected,
					{ id: selected.id, name: selected.name, areas: [] },
					safeError(error).message,
				);
			}
		}
		const projectItems = new Map<string, WorkItem[]>();
		for (const project of this.workProjects()) {
			try {
				const mapping = this.readBoards().find(
					(scope) => scope.project === project.project,
				);
				if (!mapping?.successAt) {
					throw new AppError(
						'SCOPE_UNAVAILABLE',
						mapping?.error ?? 'Selected team scope is unavailable.',
						503,
					);
				}
				const items = await this.work(
					project,
					mapping.boards.flatMap((board) => board.areas),
					signal,
				);
				this.assertRevision(selection.revision);
				this.save(`work:${project.projectId}`, 'work', items);
				projectItems.set(project.projectId, items);
				if (mapping.error) {
					this.fail(
						`work:${project.projectId}`,
						'work',
						new AppError('SCOPE_UNAVAILABLE', mapping.error, 503),
					);
				}
			} catch (error) {
				this.assertRevision(selection.revision);
				this.fail(`work:${project.projectId}`, 'work', error);
			}
		}
		for (const source of selection.boards) {
			const key = this.scopeKey(`swimlanes:${source.projectId}:${source.id}`);
			try {
				const items = projectItems.get(source.projectId);
				if (!items) {
					throw new AppError(
						'SCOPE_UNAVAILABLE',
						'Swimlane refresh requires successfully synchronized work items.',
						503,
					);
				}
				const currentSource = this.selection.boards.find(
					(selected) =>
						selected.id === source.id && selected.projectId === source.projectId,
				);
				const board = this.readBoards()
					.find((scope) => scope.project === currentSource?.project)
					?.boards.find((board) => board.id === source.id);
				const eligible = items.filter((item) => {
					const areaPath = item.areaPath;
					return (
						areaPath && board?.areas.some((area) => matchesBoardArea(areaPath, area))
					);
				});
				const boards = await loadSwimlanes(
					(path, options) => this.request(path, options),
					source,
					eligible,
					signal,
				);
				this.assertRevision(selection.revision);
				setMeta(
					this.store,
					key,
					JSON.stringify({
						boards,
						itemIds: eligible.map((item) => item.id),
						successAt: new Date().toISOString(),
						error: null,
					}),
				);
			} catch (error) {
				this.assertRevision(selection.revision);
				const safe = safeError(error);
				log('ado.swimlanes_failed', 'error', { scope: key, code: safe.code });
				const saved = meta(this.store, key);
				const previous = saved
					? swimlaneMappingSchema.parse(JSON.parse(saved))
					: { boards: [], itemIds: [], successAt: null };
				setMeta(this.store, key, JSON.stringify({ ...previous, error: safe.message }));
			}
		}
		for (const selected of selection.repositories) {
			const { id } = selected;
			try {
				const source = await resolveSource(
					(path, options) => this.request(path, options),
					'repositories',
					selected,
					signal,
				);
				this.assertRevision(selection.revision);
				setMeta(
					this.store,
					this.scopeKey(`source:repositories:${id}`),
					JSON.stringify(source),
				);
				const normalized = { id, name: source.name, project: source.project };
				const rows = await this.pullRequests(normalized, signal);
				this.assertRevision(selection.revision);
				const convert = (pr: RawPr): PullRequest => ({
					id: pr.pullRequestId,
					title: pr.title,
					project: source.project,
					repositoryId: id,
					repository: source.name,
					author: pr.createdBy.displayName ?? pr.createdBy.id,
					draft: pr.isDraft ?? false,
					url: this.url({
						kind: 'pullRequest',
						organization: cfg.org,
						project: source.project,
						repositoryId: id,
						id: pr.pullRequestId,
					}),
					reviewers: pr.reviewers.map((reviewer) => ({
						id: reviewer.id,
						name: reviewer.displayName ?? reviewer.id,
						vote: reviewer.vote ?? null,
						required: reviewer.isRequired ?? false,
						group: reviewer.isContainer ?? false,
					})),
					reason: pr.reviewers.some((reviewer) => reviewer.id === this.userId)
						? 'Personal request'
						: 'Group request',
				});
				this.save(
					`own:${id}`,
					'own',
					rows.filter((pr) => pr.createdBy.id === this.userId).map(convert),
				);
				try {
					if (!groupIds) {
						throw groupError;
					}
					this.save(
						`reviews:${id}`,
						'reviews',
						rows.filter((pr) => needsReview(pr, userId, groupIds)).map(convert),
					);
				} catch (error) {
					this.fail(`reviews:${id}`, 'reviews', error);
				}
			} catch (error) {
				this.assertRevision(selection.revision);
				this.fail(`own:${id}`, 'own', error);
				this.fail(`reviews:${id}`, 'reviews', error);
			}
		}
	}
	private async identify(signal: AbortSignal) {
		const connected = z
			.object({ authenticatedUser: z.object({ id: z.uuid() }) })
			.parse(
				(
					await this.request(
						'_apis/connectionData?connectOptions=0&api-version=7.1-preview.1',
						{ signal },
					)
				).data,
			);
		this.userId = connected.authenticatedUser.id;
		return connected.authenticatedUser.id;
	}
	/**
	 * Checks selected source identity locally; work-item area/assignment needs verify before use.
	 */
	validate(reference: Reference) {
		if (reference.organization.toLowerCase() !== this.config.adoOrganization.toLowerCase()) {
			throw new AppError('SCOPE', 'The reference is outside the configured organization.');
		}
		if (this.config.adoStatus.state === 'configuration_error') {
			throw new AppError('ADO_CONFIG', this.config.adoStatus.message, 503);
		}
		const sources = this.selection[reference.kind === 'workItem' ? 'boards' : 'repositories'];
		const source = sources.find(
			(source) =>
				(source.project.toLowerCase() === reference.project.toLowerCase() ||
					source.projectId === reference.project.toLowerCase()) &&
				(reference.kind === 'workItem' || source.id === reference.repositoryId),
		);
		if (!source) {
			throw new AppError(
				'SCOPE',
				'The reference is outside the selected Azure DevOps sources.',
			);
		}
		return source;
	}
	/** Parses scoped HTTPS work/PR links without fetching them; rejects credentials and unknown scope. */
	parseUrl(input: string): Reference {
		let url: URL;
		let segments: string[];
		try {
			url = new URL(input);
			segments = url.pathname.split('/').slice(1).map(decodeURIComponent);
		} catch {
			throw new AppError('REFERENCE', 'Enter a complete Azure DevOps work-item or PR URL.');
		}
		const [org, project, area, object, action, id] = segments;
		if (
			url.protocol !== 'https:' ||
			url.hostname !== 'dev.azure.com' ||
			url.port ||
			url.username ||
			url.password ||
			org?.toLowerCase() !== this.config.adoOrganization.toLowerCase() ||
			!project
		) {
			throw new AppError(
				'SCOPE',
				'Use an HTTPS Azure DevOps URL in the configured organization.',
			);
		}
		let reference: Reference;
		if (area === '_workitems' && object === 'edit' && action && /^\d+$/.test(action)) {
			reference = { kind: 'workItem', organization: org, project, id: Number(action) };
		} else if (
			area === '_git' &&
			action?.toLowerCase() === 'pullrequest' &&
			id &&
			/^\d+$/.test(id)
		) {
			const repo = this.repositories.find(
				(repo) => repo.id === object || repo.name.toLowerCase() === object?.toLowerCase(),
			);
			if (!repo || repo.project.toLowerCase() !== project.toLowerCase()) {
				throw new AppError(
					'SCOPE',
					'The PR repository is not selected or has not been resolved yet.',
				);
			}
			reference = {
				kind: 'pullRequest',
				organization: org,
				project,
				repositoryId: repo.id,
				id: Number(id),
			};
		} else {
			throw new AppError('REFERENCE', 'Use a work-item edit URL or a pull-request URL.');
		}
		this.validate(reference);
		return referenceSchema.parse(reference);
	}
	/** Formats an identity as a canonical link without validating scope or current availability. */
	url(reference: Reference) {
		return referenceUrl(reference);
	}
	/**
	 * Fetches and verifies selected fields/discussions, never source code or diffs.
	 * Returns serialized context capped at 24,000 characters with explicit truncation;
	 * invalid scope, unavailable objects, malformed responses, and paging limits throw.
	 */
	async detail(reference: Reference, signal: AbortSignal) {
		const authorized = await this.authorizedData(reference, signal);
		const { path, revision } = authorized;
		const data =
			reference.kind === 'workItem'
				? (await this.request(path, { signal })).data
				: authorized.data;
		this.assertRevision(revision);
		this.validateObject(reference, data);
		const discussions: unknown[] = [];
		for (let page = 0, continuation = ''; page < 100; page++) {
			const response = await this.request(
				reference.kind === 'workItem'
					? `${path}/comments?$top=200${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ''}&api-version=7.1-preview.4`
					: `${path}/threads`,
				{ signal },
			);
			this.assertRevision(revision);
			this.validate(reference);
			const values =
				reference.kind === 'workItem'
					? z.array(object).parse(response.data.comments)
					: collection.parse(response.data).value;
			discussions.push(
				...values.map((value) =>
					reference.kind === 'workItem'
						? { text: value.text, createdAt: value.createdDate }
						: {
								comments: z
									.array(object)
									.parse(value.comments)
									.map((comment) => ({
										text: comment.content,
										createdAt: comment.publishedDate,
									})),
							},
				),
			);
			continuation =
				response.continuation ??
				(typeof response.data.continuationToken === 'string'
					? response.data.continuationToken
					: '');
			if (!continuation) {
				this.validateObject(reference, data);
				const fields = reference.kind === 'workItem' ? object.parse(data.fields) : data;
				const selected =
					reference.kind === 'workItem'
						? {
								title: fields['System.Title'],
								description: fields['System.Description'],
								state: fields['System.State'],
								type: fields['System.WorkItemType'],
							}
						: {
								title: data.title,
								description: data.description,
								reviewers: data.reviewers,
							};
				const text = JSON.stringify({
					source: 'live',
					retrievedAt: new Date().toISOString(),
					url: this.url(reference),
					fields: selected,
					discussions,
					scopeStale:
						reference.kind === 'workItem' &&
						this.readBoards().some((scope) => scope.stale),
				});
				return text.length > 24000
					? {
							incomplete: true,
							reason: 'Context limit: content was truncated.',
							content: text.slice(0, 24000),
						}
					: { incomplete: false, content: text };
			}
		}
		throw new AppError('INCOMPLETE', 'Discussion paging reached its safety limit.', 502);
	}
	private validateObject(reference: Reference, data: Record<string, unknown>) {
		const source = this.validate(reference);
		if (reference.kind === 'workItem') {
			const fields = object.parse(data.fields);
			const area = fields['System.AreaPath'];
			const assigned = identity.safeParse(fields['System.AssignedTo']);
			const scope = this.readBoards().find((scope) => scope.project === source.project);
			if (
				fields['System.TeamProject'] !== source.project ||
				!assigned.success ||
				assigned.data.id !== this.userId ||
				typeof area !== 'string' ||
				!scope?.boards.some((board) =>
					board.areas.some((rule) => matchesBoardArea(area, rule)),
				)
			) {
				throw new AppError(
					'SCOPE',
					'The work item is not assigned to you within a selected team area.',
					403,
				);
			}
		} else {
			const repo = z
				.object({ id: z.string(), project: z.object({ name: z.string() }) })
				.parse(data.repository);
			if (repo.id !== reference.repositoryId || repo.project.name !== source.project) {
				throw new AppError(
					'SCOPE',
					'The PR belongs to another repository or project.',
					403,
				);
			}
		}
	}
	private async authorizedData(reference: Reference, signal: AbortSignal) {
		const revision = this.selection.revision;
		const source = this.validate(reference);
		const path =
			reference.kind === 'workItem'
				? `${source.projectId}/_apis/wit/workitems/${reference.id}`
				: `${source.projectId}/_apis/git/repositories/${reference.repositoryId}/pullrequests/${reference.id}`;
		if (reference.kind === 'workItem' && !this.userId) {
			await this.identify(signal);
		}
		this.assertRevision(revision);
		const data = (
			await this.request(
				reference.kind === 'workItem'
					? `${path}?fields=System.TeamProject,System.AreaPath,System.AssignedTo`
					: path,
				{ signal },
			)
		).data;
		this.assertRevision(revision);
		this.validateObject(reference, data);
		return { data, path, revision };
	}
	/** Fetches the object to verify current access and actual scope, returning a UTC check timestamp. */
	async verify(reference: Reference, signal: AbortSignal) {
		await this.authorizedData(reference, signal);
		return { available: true, checkedAt: new Date().toISOString() };
	}
}
