import { z } from 'zod';
import type { Source, SourceCatalog } from '../lib/contracts/settings';
import { AppError, safeError } from './errors';
import type { AzureRequestOptions, requestAzure } from './azure-http';

export type AzureReader = (
	path: string,
	options?: AzureRequestOptions,
) => ReturnType<typeof requestAzure>;

const named = z.object({
	id: z.uuid().transform((value) => value.toLowerCase()),
	name: z.string().min(1),
});
const rows = z.object({ value: z.array(named) });
const repository = named.extend({
	isDisabled: z.boolean().optional(),
	project: named,
});

/** Resolves actual source ownership and labels; clients cannot supply trusted names. */
export async function resolveSource(
	read: AzureReader,
	kind: 'boards' | 'repositories',
	source: { id: string; projectId: string },
	signal: AbortSignal,
): Promise<Source> {
	if (kind === 'repositories') {
		const repo = repository.parse(
			(await read(`_apis/git/repositories/${source.id}`, { signal })).data,
		);
		if (repo.id !== source.id || repo.project.id !== source.projectId || repo.isDisabled) {
			throw new AppError(
				'SCOPE',
				'The selected repository is disabled or belongs to another project.',
			);
		}
		return {
			id: repo.id,
			projectId: repo.project.id,
			project: repo.project.name,
			name: repo.name,
		};
	}
	const project = named.parse(
		(await read(`_apis/projects/${source.projectId}`, { signal })).data,
	);
	const team = named
		.extend({ projectId: z.uuid().optional() })
		.parse(
			(await read(`_apis/projects/${source.projectId}/teams/${source.id}`, { signal })).data,
		);
	if (
		project.id !== source.projectId ||
		team.id !== source.id ||
		(team.projectId && team.projectId !== source.projectId)
	) {
		throw new AppError('SCOPE', 'The selected team belongs to another project.');
	}
	return { id: team.id, name: team.name, projectId: project.id, project: project.name };
}

/** Enumerates metadata only; per-project failures are explicit and never enable sources. */
export async function discoverSources(
	read: AzureReader,
	signal: AbortSignal,
): Promise<SourceCatalog> {
	const catalog: SourceCatalog = { boards: [], repositories: [], errors: [] };
	const projects: z.infer<typeof named>[] = [];
	const seen = new Set<string>();
	try {
		let continuation = '';
		for (let page = 0; ; page++) {
			if (page >= 100) {
				throw new AppError('INCOMPLETE', 'Project discovery reached its paging limit.');
			}
			const response = await read(
				`_apis/projects?$top=100${continuation ? `&continuationToken=${encodeURIComponent(continuation)}` : ''}`,
				{ signal },
			);
			for (const project of rows.parse(response.data).value) {
				if (seen.has(project.id)) {
					throw new AppError('INCOMPLETE', 'Project discovery did not advance.');
				}
				seen.add(project.id);
				projects.push(project);
			}
			const next = response.continuation ?? '';
			if (!next) {
				break;
			}
			if (next === continuation) {
				throw new AppError(
					'INCOMPLETE',
					'Project discovery repeated a continuation token.',
				);
			}
			continuation = next;
		}
	} catch (error) {
		if (signal.aborted) {
			throw new AppError('CANCELLED', 'Source discovery was cancelled.', 409);
		}
		catalog.errors.push(`Projects: ${safeError(error).message}`);
	}
	for (const project of projects) {
		try {
			const teams: Source[] = [];
			const teamIds = new Set<string>();
			for (let page = 0; ; page++) {
				if (page >= 100) {
					throw new AppError('INCOMPLETE', 'Team discovery reached its paging limit.');
				}
				const response = await read(
					`_apis/projects/${project.id}/teams?$mine=false&$top=100&$skip=${page * 100}`,
					{ signal },
				);
				if (response.continuation) {
					throw new AppError('INCOMPLETE', 'Team discovery returned unsupported paging.');
				}
				const batch = rows.parse(response.data).value;
				for (const team of batch) {
					if (teamIds.has(team.id)) {
						throw new AppError('INCOMPLETE', 'Team discovery did not advance.');
					}
					teamIds.add(team.id);
					teams.push({ ...team, projectId: project.id, project: project.name });
				}
				if (batch.length < 100) {
					catalog.boards.push(...teams);
					break;
				}
			}
		} catch (error) {
			if (signal.aborted) {
				throw new AppError('CANCELLED', 'Source discovery was cancelled.', 409);
			}
			catalog.errors.push(`${project.name} teams: ${safeError(error).message}`);
		}
		try {
			const response = await read(`${project.id}/_apis/git/repositories?includeHidden=true`, {
				signal,
			});
			if (response.continuation) {
				throw new AppError(
					'INCOMPLETE',
					'Repository discovery returned unsupported paging.',
				);
			}
			const repos = z.object({ value: z.array(repository) }).parse(response.data).value;
			const repoIds = new Set<string>();
			for (const repo of repos) {
				if (repo.project.id !== project.id || repoIds.has(repo.id)) {
					throw new AppError(
						'INCOMPLETE',
						'Repository discovery returned invalid ownership or duplicates.',
					);
				}
				repoIds.add(repo.id);
			}
			catalog.repositories.push(
				...repos
					.filter((repo) => !repo.isDisabled)
					.map((repo) => ({
						id: repo.id,
						name: repo.name,
						projectId: project.id,
						project: project.name,
					})),
			);
		} catch (error) {
			if (signal.aborted) {
				throw new AppError('CANCELLED', 'Source discovery was cancelled.', 409);
			}
			catalog.errors.push(`${project.name} repositories: ${safeError(error).message}`);
		}
	}
	return catalog;
}
