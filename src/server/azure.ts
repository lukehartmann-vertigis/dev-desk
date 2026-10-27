import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { boardScopeSchema, referenceSchema, referenceUrl, workSchema } from '../lib/contracts';
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
import { initialRepositories } from './config';
import { AppError, log, safeError } from './errors';
import { snapshots } from './schema';
import { meta, setMeta, type Store } from './store';

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

export function needsReview(pr: RawPr, userId: string, groups: Set<string>) {
	const personal = pr.reviewers.find((reviewer) => reviewer.id === userId);
	if (personal?.vote === 5 || personal?.vote === 10) return false;
	if (personal) return true;
	const relevant = pr.reviewers.filter(
		(reviewer) =>
			groups.has(reviewer.id) || (reviewer.descriptor && groups.has(reviewer.descriptor)),
	);
	if (relevant.some((reviewer) => reviewer.vote === undefined))
		throw new AppError('INCOMPLETE', 'A reviewer group vote is unavailable.', 502);
	return (
		relevant.length > 0 &&
		!relevant.every((reviewer) => reviewer.vote === 5 || reviewer.vote === 10)
	);
}

export class Azure {
	repositories: Repository[] = initialRepositories;
	private projects = new Map<string, { id: string; name: string }>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private active: Promise<void> | undefined;
	private abort: AbortController | undefined;
	private stopped = false;
	private userId: string | undefined;
	constructor(
		private store: Store,
		private config: Configuration,
		private transport: typeof fetch = fetch,
	) {}
	get running() {
		return Boolean(this.active);
	}
	private settings() {
		if (!this.config.ado)
			throw new AppError('ADO_DISABLED', this.config.adoStatus.message, 503);
		return this.config.ado;
	}
	private async request(
		path: string,
		options: { graph?: boolean; body?: unknown; signal?: AbortSignal } = {},
	) {
		const cfg = this.settings();
		const url = new URL(
			`https://${options.graph ? 'vssps.' : ''}dev.azure.com/${encodeURIComponent(cfg.org)}/${path}`,
		);
		if (!url.searchParams.has('api-version'))
			url.searchParams.set('api-version', options.graph ? '7.1-preview.1' : '7.1');
		for (let attempt = 0; attempt < 3; attempt++) {
			let response: Response;
			try {
				response = await this.transport(url, {
					method: options.body === undefined ? 'GET' : 'POST',
					headers: {
						Authorization: `Basic ${Buffer.from(`:${cfg.token}`).toString('base64')}`,
						'Content-Type': 'application/json',
					},
					...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
					signal: AbortSignal.any([
						AbortSignal.timeout(15000),
						...(options.signal ? [options.signal] : []),
					]),
					redirect: 'error',
					cache: 'no-store',
				});
			} catch {
				throw new AppError(
					'ADO_CONNECTION',
					'Azure DevOps could not be reached. Check connectivity and retry.',
					502,
				);
			}
			if (response.ok) {
				return {
					data: object.parse(await response.json()),
					continuation:
						response.headers.get('x-ms-continuationtoken') ??
						response.headers.get('x-ms-continuation-token'),
				};
			}
			if ((response.status === 429 || response.status >= 500) && attempt < 2) {
				const retry = response.headers.get('retry-after');
				const seconds = retry
					? /^\d+$/.test(retry)
						? Number(retry)
						: Math.max(0, (Date.parse(retry) - Date.now()) / 1000)
					: attempt + 1;
				if (!Number.isFinite(seconds) || seconds > 30)
					throw new AppError(
						'ADO_THROTTLED',
						'Azure DevOps requested a longer retry delay. Cached data is retained.',
						503,
					);
				await delay(seconds * 1000, undefined, { signal: options.signal }).catch(
					(error: unknown) => {
						if (options.signal?.aborted)
							throw new AppError(
								'CANCELLED',
								'Azure DevOps refresh was cancelled.',
								503,
							);
						throw error;
					},
				);
				continue;
			}
			throw new AppError(
				'ADO_HTTP',
				response.status === 401 || response.status === 403
					? 'Azure DevOps denied access. Check PAT expiry, Code/Work Items/Graph/Project and Team read scopes, and project permissions.'
					: `Azure DevOps returned HTTP ${response.status}. The scope was not replaced.`,
				502,
			);
		}
		throw new AppError('ADO_RETRY', 'Azure DevOps retry budget exhausted.', 502);
	}
	private scopeKey(scope: string) {
		return `${this.config.ado?.org.toLowerCase() ?? 'vertigis'}:${scope}`;
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
	read(): Snapshot[] {
		const cfg = this.config.ado;
		if (!cfg) return [];
		const scopes = new Set([
			...cfg.projects.map((project) => this.scopeKey(`work:${project}`)),
			...cfg.repositoryIds.flatMap((id) => [
				this.scopeKey(`own:${id}`),
				this.scopeKey(`reviews:${id}`),
			]),
		]);
		return this.store.db
			.select()
			.from(snapshots)
			.all()
			.filter((row) => scopes.has(row.scope))
			.map((row) => ({
				...row,
				dataset: z.enum(['work', 'reviews', 'own']).parse(row.dataset),
				data:
					row.dataset === 'work'
						? z.array(workSchema).parse(JSON.parse(row.data))
						: (JSON.parse(row.data) as PullRequest[]),
				stale:
					Boolean(row.error) ||
					!row.successAt ||
					Date.now() - Date.parse(row.successAt) > cfg.interval * 2000,
			}));
	}
	readBoards(): BoardScope[] {
		const cfg = this.config.ado;
		if (!cfg) return [];
		return cfg.projects.map((project) => {
			const saved = meta(this.store, this.scopeKey(`boards:${project}`));
			const scope = saved
				? boardScopeSchema.parse(JSON.parse(saved))
				: { project, boards: [], successAt: null, error: null, stale: true };
			return {
				...scope,
				stale:
					Boolean(scope.error) ||
					!scope.successAt ||
					Date.now() - Date.parse(scope.successAt) > cfg.interval * 2000,
			};
		});
	}
	private async syncBoards(
		configured: string,
		project: { id: string; name: string },
		signal: AbortSignal,
	) {
		const key = this.scopeKey(`boards:${configured}`);
		try {
			const boards: TeamBoard[] = [],
				seen = new Set<string>();
			for (let page = 0; page < 20; page++) {
				const response = await this.request(
					`_apis/projects/${project.id}/teams?$mine=true&$top=100&$skip=${page * 100}`,
					{ signal },
				);
				const teams = z
					.array(z.object({ id: z.uuid(), name: z.string().min(1) }))
					.parse(response.data.value);
				if (response.continuation)
					throw new AppError(
						'INCOMPLETE',
						'Team paging returned an unsupported continuation.',
						502,
					);
				for (const team of teams) {
					if (seen.has(team.id))
						throw new AppError('INCOMPLETE', 'Team paging did not advance.', 502);
					seen.add(team.id);
					const settings = z
						.object({
							field: z.object({ referenceName: z.literal('System.AreaPath') }),
							values: z.array(
								z.object({
									value: z.string().min(1),
									includeChildren: z.boolean(),
								}),
							),
						})
						.parse(
							(
								await this.request(
									`${project.id}/${team.id}/_apis/work/teamsettings/teamfieldvalues`,
									{ signal },
								)
							).data,
						);
					boards.push({
						...team,
						areas: settings.values.map((area) => ({
							path: area.value,
							includeChildren: area.includeChildren,
						})),
					});
				}
				if (teams.length < 100) {
					setMeta(
						this.store,
						key,
						JSON.stringify({
							project: project.name,
							boards,
							successAt: new Date().toISOString(),
							error: null,
							stale: false,
						}),
					);
					return;
				}
			}
			throw new AppError('INCOMPLETE', 'Team paging reached its safety limit.', 502);
		} catch (error) {
			const safe = safeError(error),
				saved = meta(this.store, key);
			log('ado.board_scopes_failed', 'error', { scope: key, code: safe.code });
			const previous = saved
				? boardScopeSchema.parse(JSON.parse(saved))
				: { project: project.name, boards: [], successAt: null };
			setMeta(
				this.store,
				key,
				JSON.stringify({ ...previous, error: safe.message, stale: true }),
			);
		}
	}
	/** Requests one full refresh; concurrent callers share its promise. */
	refresh() {
		if (!this.config.ado || this.stopped)
			throw new AppError('ADO_DISABLED', this.config.adoStatus.message, 503);
		if (this.active) return this.active;
		clearTimeout(this.timer);
		this.abort = new AbortController();
		this.active = this.sync(AbortSignal.any([this.abort.signal, AbortSignal.timeout(120000)]))
			.catch((error: unknown) => {
				const cfg = this.settings();
				for (const project of cfg.projects) this.fail(`work:${project}`, 'work', error);
				for (const id of cfg.repositoryIds) {
					this.fail(`own:${id}`, 'own', error);
					this.fail(`reviews:${id}`, 'reviews', error);
				}
			})
			.finally(() => {
				this.active = undefined;
				if (!this.stopped)
					this.timer = setTimeout(() => {
						void this.refresh();
					}, this.settings().interval * 1000);
			});
		return this.active;
	}
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
			)
				throw new AppError(
					'IDENTITY_MISMATCH',
					'The configured email does not match the PAT identity.',
					502,
				);
		}
		const queue = [descriptor],
			visited = new Set<string>(),
			groups = new Set<string>();
		while (queue.length) {
			const subject = queue.shift();
			if (!subject || visited.has(subject)) continue;
			if (visited.size >= 2000)
				throw new AppError(
					'INCOMPLETE',
					'Group traversal reached its safety limit. Review data is incomplete.',
					502,
				);
			visited.add(subject);
			const response = await this.request(
				`_apis/graph/memberships/${encodeURIComponent(subject)}?direction=up&depth=1`,
				{ graph: true, signal },
			);
			if (response.continuation)
				throw new AppError(
					'INCOMPLETE',
					'Graph returned an unsupported continuation. Group membership is incomplete.',
					502,
				);
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
	private async work(project: string, signal: AbortSignal): Promise<WorkItem[]> {
		const items: WorkItem[] = [];
		let after = 0;
		for (let page = 0; page < 200; page++) {
			const result = await this.request(
				`${encodeURIComponent(project)}/_apis/wit/wiql?$top=1000`,
				{
					signal,
					body: {
						query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND [System.Id] > ${after} ORDER BY [System.Id]`,
					},
				},
			);
			const ids = z
				.array(z.object({ id: z.number().int().positive() }))
				.parse(result.data.workItems)
				.map((item) => item.id);
			if (ids.some((id, index) => id <= (index ? (ids[index - 1] ?? after) : after)))
				throw new AppError('INCOMPLETE', 'Work-item paging did not advance.', 502);
			for (let offset = 0; offset < ids.length; offset += 200) {
				const batch = ids.slice(offset, offset + 200);
				const values = collection.parse(
					(
						await this.request(
							`${encodeURIComponent(project)}/_apis/wit/workitemsbatch`,
							{ signal, body: { ids: batch, errorPolicy: 'Fail' } },
						)
					).data,
				).value;
				if (values.length !== batch.length)
					throw new AppError(
						'INCOMPLETE',
						'Some assigned work items were not returned.',
						502,
					);
				for (const value of values) {
					const fields = object.parse(value.fields),
						id = z.number().parse(value.id);
					items.push({
						id,
						project,
						title: z.string().parse(fields['System.Title']),
						type: z.string().parse(fields['System.WorkItemType']),
						state: z.string().parse(fields['System.State']),
						priority:
							typeof fields['Microsoft.VSTS.Common.Priority'] === 'number'
								? fields['Microsoft.VSTS.Common.Priority']
								: null,
						areaPath:
							typeof fields['System.AreaPath'] === 'string'
								? fields['System.AreaPath']
								: null,
						url: this.url({
							kind: 'workItem',
							organization: this.settings().org,
							project,
							id,
						}),
					});
				}
			}
			if (ids.length < 1000) return items;
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
			if (rows.length < 100) return result;
		}
		throw new AppError('INCOMPLETE', 'PR paging reached its safety limit.', 502);
	}
	private async sync(signal: AbortSignal) {
		const cfg = this.settings();
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
		let groupIds: Set<string> | undefined, groupError: unknown;
		try {
			groupIds = await this.groups(signal);
		} catch (error) {
			groupError = error;
		}
		if (cfg.email && groupError) throw groupError;
		const boardProjects: { configured: string; project: { id: string; name: string } }[] = [];
		for (const configured of cfg.projects) {
			try {
				const project = z.object({ id: z.uuid(), name: z.string() }).parse(
					(
						await this.request(`_apis/projects/${encodeURIComponent(configured)}`, {
							signal,
						})
					).data,
				);
				this.projects.set(configured, project);
				boardProjects.push({ configured, project });
				this.save(`work:${configured}`, 'work', await this.work(project.name, signal));
			} catch (error) {
				this.fail(`work:${configured}`, 'work', error);
			}
		}
		const repositories: Repository[] = [];
		for (const id of cfg.repositoryIds) {
			try {
				const repo = z
					.object({
						id: z.uuid(),
						name: z.string(),
						isDisabled: z.boolean().optional(),
						project: z.object({ id: z.uuid(), name: z.string() }),
					})
					.parse((await this.request(`_apis/git/repositories/${id}`, { signal })).data);
				if (
					repo.isDisabled ||
					![...this.projects.values()].some((project) => project.id === repo.project.id)
				)
					throw new AppError(
						'SCOPE',
						'Selected repository is disabled, inaccessible, or outside configured projects.',
						502,
					);
				const normalized = { id, name: repo.name, project: repo.project.name };
				repositories.push(normalized);
				const rows = await this.pullRequests(normalized, signal);
				const convert = (pr: RawPr): PullRequest => ({
					id: pr.pullRequestId,
					title: pr.title,
					project: repo.project.name,
					repositoryId: id,
					repository: repo.name,
					author: pr.createdBy.displayName ?? pr.createdBy.id,
					draft: pr.isDraft ?? false,
					url: this.url({
						kind: 'pullRequest',
						organization: cfg.org,
						project: repo.project.name,
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
					if (!groupIds) throw groupError;
					this.save(
						`reviews:${id}`,
						'reviews',
						rows
							.filter((pr) =>
								needsReview(pr, connected.authenticatedUser.id, groupIds),
							)
							.map(convert),
					);
				} catch (error) {
					this.fail(`reviews:${id}`, 'reviews', error);
				}
			} catch (error) {
				this.fail(`own:${id}`, 'own', error);
				this.fail(`reviews:${id}`, 'reviews', error);
			}
		}
		this.repositories = repositories;
		for (const { configured, project } of boardProjects)
			await this.syncBoards(configured, project, signal);
	}
	validate(reference: Reference) {
		if (
			reference.organization.toLowerCase() !==
			(this.config.ado?.org ?? 'vertigis').toLowerCase()
		)
			throw new AppError('SCOPE', 'The reference is outside the configured organization.');
		if (this.config.adoStatus.state === 'configuration_error')
			throw new AppError('ADO_CONFIG', this.config.adoStatus.message, 503);
		const cfg = this.config.ado ?? {
			projects: ['Utilities'],
			repositoryIds: initialRepositories.map((repo) => repo.id),
		};
		if (
			!cfg.projects.some(
				(project) =>
					project.toLowerCase() === reference.project.toLowerCase() ||
					this.projects.get(project)?.name.toLowerCase() ===
						reference.project.toLowerCase(),
			)
		)
			throw new AppError('SCOPE', 'The reference is outside the configured projects.');
		if (reference.kind === 'pullRequest' && !cfg.repositoryIds.includes(reference.repositoryId))
			throw new AppError('SCOPE', 'The PR repository is not allowlisted.');
	}
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
			org !== (this.config.ado?.org ?? 'vertigis') ||
			!project
		)
			throw new AppError(
				'SCOPE',
				'Use an HTTPS Azure DevOps URL in the configured organization.',
			);
		let reference: Reference;
		if (area === '_workitems' && object === 'edit' && action && /^\d+$/.test(action))
			reference = { kind: 'workItem', organization: org, project, id: Number(action) };
		else if (
			area === '_git' &&
			action?.toLowerCase() === 'pullrequest' &&
			id &&
			/^\d+$/.test(id)
		) {
			const repo = this.repositories.find(
				(repo) => repo.id === object || repo.name.toLowerCase() === object?.toLowerCase(),
			);
			if (!repo || repo.project.toLowerCase() !== project.toLowerCase())
				throw new AppError(
					'SCOPE',
					'The PR repository is not selected or has not been resolved yet.',
				);
			reference = {
				kind: 'pullRequest',
				organization: org,
				project,
				repositoryId: repo.id,
				id: Number(id),
			};
		} else throw new AppError('REFERENCE', 'Use a work-item edit URL or a pull-request URL.');
		this.validate(reference);
		return referenceSchema.parse(reference);
	}
	url(reference: Reference) {
		return referenceUrl(reference);
	}
	async detail(reference: Reference, signal: AbortSignal) {
		this.validate(reference);
		const project = encodeURIComponent(reference.project);
		const path =
			reference.kind === 'workItem'
				? `${project}/_apis/wit/workitems/${reference.id}`
				: `${project}/_apis/git/repositories/${reference.repositoryId}/pullrequests/${reference.id}`;
		const data = (await this.request(path, { signal })).data;
		this.validateObject(reference, data);
		const discussions: unknown[] = [];
		for (let page = 0, continuation = ''; page < 100; page++) {
			const response = await this.request(
				reference.kind === 'workItem'
					? `${path}/comments?$top=200${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ''}&api-version=7.1-preview.4`
					: `${path}/threads`,
				{ signal },
			);
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
		const expected = this.projects.get(reference.project)?.name ?? reference.project;
		if (reference.kind === 'workItem') {
			const fields = object.parse(data.fields);
			if (fields['System.TeamProject'] !== expected)
				throw new AppError('SCOPE', 'The work item belongs to another project.', 403);
		} else {
			const repo = z
				.object({ id: z.string(), project: z.object({ name: z.string() }) })
				.parse(data.repository);
			if (repo.id !== reference.repositoryId || repo.project.name !== expected)
				throw new AppError(
					'SCOPE',
					'The PR belongs to another repository or project.',
					403,
				);
		}
	}
	async verify(reference: Reference, signal: AbortSignal) {
		this.validate(reference);
		const path =
			reference.kind === 'workItem'
				? `${encodeURIComponent(reference.project)}/_apis/wit/workitems/${reference.id}`
				: `${encodeURIComponent(reference.project)}/_apis/git/repositories/${reference.repositoryId}/pullrequests/${reference.id}`;
		this.validateObject(reference, (await this.request(path, { signal })).data);
		return { available: true, checkedAt: new Date().toISOString() };
	}
}
