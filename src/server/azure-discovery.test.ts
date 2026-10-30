import { describe, expect, it } from 'vitest';
import { discoverSources, resolveSource, type AzureReader } from './azure-discovery';
import { AppError } from './errors';

const projectId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const teamId = '33333333-3333-4333-8333-333333333333';
const repositoryId = '44444444-4444-4444-8444-444444444444';
const signal = () => new AbortController().signal;
const response = (data: Record<string, unknown>, continuation: string | null = null) => ({
	data,
	continuation,
});

describe('metadata-only Azure source discovery', () => {
	it('SET-002 follows project continuation and lists readable teams across projects without memberships', async () => {
		const paths: string[] = [];
		const reader: AzureReader = async (path) => {
			paths.push(path);
			if (path.startsWith('_apis/projects?')) {
				return path.includes('continuationToken')
					? response({ value: [{ id: otherId, name: 'Other project' }] })
					: response({ value: [{ id: projectId, name: 'Project' }] }, '1');
			}
			if (path.includes('/teams?')) {
				expect(path).toContain('$mine=false');
				return response({
					value: path.includes(projectId) ? [{ id: teamId, name: 'Readable team' }] : [],
				});
			}
			if (path.includes('/repositories?')) {
				return response({
					value: path.startsWith(otherId)
						? [
								{
									id: repositoryId,
									name: 'Other repo',
									project: { id: otherId, name: 'Other project' },
								},
							]
						: [],
				});
			}
			throw new Error(`Unexpected discovery path: ${path}`);
		};
		const catalog = await discoverSources(reader, signal());
		expect(catalog.errors).toEqual([]);
		expect(catalog.boards[0]).toMatchObject({ id: teamId, projectId });
		expect(catalog.repositories[0]).toMatchObject({ id: repositoryId, projectId: otherId });
		expect(
			paths.some((path) => /workitems|pullrequests|teamfieldvalues|graph/.test(path)),
		).toBe(false);
	});
	it('SET-009 distinguishes denied and incomplete catalogs and keeps independent successful metadata', async () => {
		const reader: AzureReader = async (path) => {
			if (path.startsWith('_apis/projects?')) {
				return response({ value: [{ id: projectId, name: 'Project' }] }, 'same');
			}
			if (path.includes('/teams?')) {
				throw new AppError('DENIED', 'Teams are unavailable.');
			}
			return response({
				value: [
					{ id: repositoryId, name: 'Repo', project: { id: projectId, name: 'Project' } },
				],
			});
		};
		const catalog = await discoverSources(reader, signal());
		expect(catalog.errors).toHaveLength(2);
		expect(catalog.boards).toEqual([]);
		expect(catalog.repositories).toHaveLength(1);
		const failed = await discoverSources(async () => {
			throw new AppError('DENIED', 'Access denied.');
		}, signal());
		expect(failed.errors).toEqual(['Projects: Access denied.']);
		expect(failed.repositories).toEqual([]);
	});
	it('SET-003 rejects mismatched project ownership and disabled repositories', async () => {
		const identity = { id: repositoryId, projectId };
		const reader: AzureReader = async () =>
			response({ id: repositoryId, name: 'Repo', project: { id: otherId, name: 'Other' } });
		await expect(resolveSource(reader, 'repositories', identity, signal())).rejects.toThrow(
			'another project',
		);
		await expect(
			resolveSource(
				async () =>
					response({
						id: repositoryId,
						name: 'Repo',
						isDisabled: true,
						project: { id: projectId, name: 'Project' },
					}),
				'repositories',
				identity,
				signal(),
			),
		).rejects.toThrow('disabled');
	});
});
