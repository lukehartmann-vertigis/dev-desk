import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Azure, needsReview } from './azure';
import { configuration, initialRepositories } from './config';
import { openStore, type Store } from './store';
import { matchesBoardArea } from '../lib/contracts';

let directory: string;
let store: Store;
let service: Azure | undefined;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-ado-'));
	store = openStore(join(directory, 'test.db'));
});
afterEach(async () => {
	await service?.stop();
	service = undefined;
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});
const user = '11111111-1111-4111-8111-111111111111';
const project = '1426d070-28f0-4cd2-9493-5b75482f174f';
const pr = (reviewers: { id: string; vote?: number }[]) => ({
	pullRequestId: 1,
	title: 'A PR',
	createdBy: { id: 'author' },
	reviewers,
});

describe('ADO-004/012 review semantics', () => {
	it.each([
		[
			[
				{ id: user, vote: 10 },
				{ id: 'group', vote: 0 },
			],
			false,
		],
		[[{ id: user, vote: 5 }], false],
		[
			[
				{ id: user, vote: 0 },
				{ id: 'group', vote: 10 },
			],
			true,
		],
		[[{ id: user, vote: -10 }], true],
		[[{ id: 'group', vote: 10 }], false],
		[
			[
				{ id: 'group', vote: 5 },
				{ id: 'other', vote: 0 },
			],
			true,
		],
		[[], false],
	] as const)('handles reviewers %j => %s', (reviewers, expected) => {
		expect(needsReview(pr([...reviewers]), user, new Set(['group', 'other']))).toBe(expected);
	});
	it('does not infer approval from a missing group vote', () =>
		expect(() => needsReview(pr([{ id: 'group' }]), user, new Set(['group']))).toThrow(
			'unavailable',
		));
});

describe('read-only ADO adapter', () => {
	it.each(['0', '9007199254740992', '%E0%A4', 'not-an-id'])(
		'TODO-009 rejects invalid reference IDs and malformed encoding: %s',
		(id) => {
			service = new Azure(store, configuration({}));
			expect(() =>
				service?.parseUrl(`https://dev.azure.com/vertigis/Utilities/_workitems/edit/${id}`),
			).toThrow();
		},
	);

	function transport(
		options: {
			failWork?: boolean;
			graphDenied?: boolean;
			multiplePages?: boolean;
			teamsDenied?: boolean;
			settingsDenied?: boolean;
			unsupportedField?: boolean;
			teamCount?: number;
			repeatTeams?: boolean;
		} = {},
	): typeof fetch {
		return async (input, init) => {
			const url = new URL(String(input));
			const path = url.pathname;
			if (path.endsWith('/connectionData')) {
				expect(url.searchParams.get('api-version')).toBe('7.1-preview.1');
				return Response.json({ authenticatedUser: { id: user } });
			}
			if (path.includes('/graph/')) {
				if (options.graphDenied) {
					return new Response('', { status: 403 });
				}
				if (path.includes('/descriptors/')) {
					return Response.json({ value: 'userDescriptor' });
				}
				if (path.includes('/storagekeys/')) {
					return Response.json({ value: path.endsWith('parentA') ? 'group' : 'other' });
				}
				if (path.includes('/memberships/')) {
					return Response.json({
						value: [
							{
								containerDescriptor: path.endsWith('parentA')
									? 'parentB'
									: 'parentA',
							},
						],
					});
				}
			}
			if (path.endsWith('/teams')) {
				expect(url.searchParams.get('$mine')).toBe('true');
				expect(url.searchParams.get('$top')).toBe('100');
				if (options.teamsDenied) {
					return new Response('', { status: 403 });
				}
				const skip = options.repeatTeams ? 0 : Number(url.searchParams.get('$skip'));
				return Response.json({
					value: Array.from({ length: options.teamCount ?? 2 }, (_, index) => ({
						id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
						name: `Team ${index}`,
					})).slice(skip, skip + 100),
				});
			}
			if (path.endsWith('/teamfieldvalues')) {
				if (options.settingsDenied) {
					return new Response('', { status: 403 });
				}
				return Response.json({
					field: {
						referenceName: options.unsupportedField
							? 'System.IterationPath'
							: 'System.AreaPath',
					},
					values: [
						{
							value: 'Utilities\\Feature',
							includeChildren: path.includes('8000-000000000000'),
						},
					],
				});
			}
			if (path.includes('/projects/')) {
				return Response.json({ id: project, name: 'Utilities' });
			}
			if (path.endsWith('/wiql')) {
				if (options.failWork) {
					return new Response('', { status: 403 });
				}
				const body = JSON.parse(String(init?.body)) as { query: string };
				let workItems = [{ id: 1 }];
				if (options.multiplePages && body.query.includes('> 0 ')) {
					workItems = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 }));
				} else if (body.query.includes('> 1000 ')) {
					workItems = [{ id: 1001 }];
				}
				return Response.json({ workItems });
			}
			if (path.endsWith('/workitemsbatch')) {
				const body = JSON.parse(String(init?.body)) as { ids: number[] };
				return Response.json({
					value: body.ids.map((id) => ({
						id,
						fields: {
							'System.Title': `Work ${id}`,
							'System.WorkItemType': 'Custom type',
							'System.State': 'Done',
							'System.AreaPath': 'Utilities\\Feature\\Child',
						},
					})),
				});
			}
			if (path.endsWith('/pullrequests')) {
				return Response.json({
					value: [
						{
							...pr([{ id: 'group', vote: 0 }]),
							createdBy: { id: user, displayName: 'Synthetic user' },
						},
					],
				});
			}
			const repo = initialRepositories.find((repo) => path.endsWith(repo.id));
			if (repo) {
				return Response.json({
					...repo,
					project: { id: project, name: 'Utilities' },
					isDisabled: false,
				});
			}
			throw new Error(`Unexpected synthetic endpoint: ${path}`);
		};
	}
	it('ADO-003/009 traverses all WIQL pages/batches without dropping terminal/custom states', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ multiplePages: true }),
		);
		await service.refresh();
		const work = service.read().find((scope) => scope.dataset === 'work');
		expect(work?.data).toHaveLength(1001);
		expect(work?.error).toBeNull();
		expect(work?.data[0]).toMatchObject({ state: 'Done', type: 'Custom type', priority: null });
		expect(service.read().find((scope) => scope.dataset === 'reviews')?.data).toHaveLength(1);
	});
	it('loads only the current user teams with all area rules, persists them, and supports overlapping scopes', async () => {
		const cfg = configuration({ AZURE_DEVOPS_PAT: 'synthetic' });
		service = new Azure(store, cfg, transport());
		await service.refresh();
		const scope = service.readBoards()[0];
		expect(scope).toMatchObject({ project: 'Utilities', error: null, stale: false });
		expect(scope?.boards).toHaveLength(2);
		expect(
			scope?.boards.filter((board) =>
				board.areas.some((area) => matchesBoardArea('utilities\\feature', area)),
			),
		).toHaveLength(2);
		expect(
			scope?.boards.filter((board) =>
				board.areas.some((area) => matchesBoardArea('Utilities\\Feature\\Child', area)),
			),
		).toHaveLength(1);
		expect(
			scope?.boards.filter((board) =>
				board.areas.some((area) => matchesBoardArea('Utilities\\FeatureOther', area)),
			),
		).toHaveLength(0);
		await service.stop();
		service = new Azure(store, cfg, transport());
		expect(service.readBoards()).toEqual([scope]);
		expect(
			new Azure(
				store,
				configuration({ AZURE_DEVOPS_PAT: 'synthetic', AZURE_DEVOPS_ORG: 'other' }),
			).readBoards()[0]?.successAt,
		).toBeNull();
	});
	it('loads all team pages before publishing board metadata', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamCount: 101 }),
		);
		await service.refresh();
		expect(service.readBoards()[0]?.boards).toHaveLength(101);
		expect(service.readBoards()[0]?.stale).toBe(false);
	});
	it.each(['teamsDenied', 'settingsDenied', 'repeatTeams', 'unsupportedField'] as const)(
		'retains last-good team scopes on %s without losing work or PR data',
		async (failure) => {
			const cfg = configuration({ AZURE_DEVOPS_PAT: 'synthetic' });
			service = new Azure(store, cfg, transport());
			await service.refresh();
			const previous = service.readBoards()[0];
			await service.stop();
			service = new Azure(store, cfg, transport({ [failure]: true, teamCount: 100 }));
			await service.refresh();
			expect(service.readBoards()[0]).toMatchObject({
				boards: previous?.boards,
				successAt: previous?.successAt,
				stale: true,
				error: expect.any(String),
			});
			expect(service.read().find((scope) => scope.dataset === 'work')).toMatchObject({
				stale: false,
				error: null,
			});
			expect(service.read().find((scope) => scope.dataset === 'own')?.data).toHaveLength(1);
		},
	);
	it('refreshes core work and PR snapshots before annotation requests consume the remaining deadline', async () => {
		const paths: string[] = [];
		const upstream = transport();
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) => {
				paths.push(new URL(String(input)).pathname);
				return upstream(input, init);
			},
		);
		await service.refresh();
		expect(paths.findIndex((path) => path.endsWith('/teams'))).toBeGreaterThan(
			paths.findLastIndex((path) => path.endsWith('/pullrequests')),
		);
	});
	it('reports unknown board mapping on initial permission failure without discarding core data', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamsDenied: true }),
		);
		await service.refresh();
		expect(service.readBoards()[0]).toMatchObject({
			boards: [],
			successAt: null,
			stale: true,
			error: expect.stringContaining('denied'),
		});
		expect(service.read().find((scope) => scope.dataset === 'work')?.data).toHaveLength(1);
		expect(service.read().find((scope) => scope.dataset === 'own')?.data).toHaveLength(1);
	});
	it('distinguishes no team memberships from unknown metadata and tolerates older cached work', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamCount: 0 }),
		);
		expect(service.readBoards()[0]).toMatchObject({ boards: [], successAt: null, stale: true });
		await service.refresh();
		expect(service.readBoards()[0]).toMatchObject({
			boards: [],
			successAt: expect.any(String),
			error: null,
			stale: false,
		});
		store.sqlite
			.prepare(
				"UPDATE snapshots SET data = json_remove(data, '$[0].areaPath') WHERE dataset = 'work'",
			)
			.run();
		expect(service.read().find((scope) => scope.dataset === 'work')?.data[0]).toMatchObject({
			areaPath: null,
		});
	});
	it('ADO-009/010 keeps last-good work while other datasets update after a scope failure', async () => {
		const cfg = configuration({ AZURE_DEVOPS_PAT: 'synthetic' });
		service = new Azure(store, cfg, transport());
		await service.refresh();
		await service.stop();
		service = new Azure(store, cfg, transport({ failWork: true }));
		await service.refresh();
		const work = service.read().find((scope) => scope.dataset === 'work');
		expect(work?.data).toHaveLength(1);
		expect(work?.stale).toBe(true);
		expect(work?.error).toContain('denied');
		expect(service.read().find((scope) => scope.dataset === 'own')?.error).toBeNull();
	});
	it('ADO-012 surfaces missing Graph permission without disabling work and own PRs', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ graphDenied: true }),
		);
		await service.refresh();
		expect(service.read().find((scope) => scope.dataset === 'reviews')?.error).toContain(
			'denied',
		);
		expect(service.read().find((scope) => scope.dataset === 'own')?.data).toHaveLength(1);
		expect(service.read().find((scope) => scope.dataset === 'work')?.data).toHaveLength(1);
	});
	it('TODO-009/AI-009 parses only scoped Azure URLs and rejects arbitrary navigation', () => {
		service = new Azure(store, configuration({}));
		expect(
			service.parseUrl('https://dev.azure.com/vertigis/Utilities/_workitems/edit/123'),
		).toEqual({ kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 123 });
		expect(
			service.parseUrl(
				'https://dev.azure.com/vertigis/Utilities/_git/network-locator/pullrequest/4',
			),
		).toMatchObject({ kind: 'pullRequest', repositoryId: initialRepositories[0]?.id });
		expect(() =>
			service?.parseUrl('https://evil.test/vertigis/Utilities/_workitems/edit/1'),
		).toThrow();
		expect(() =>
			service?.parseUrl('https://dev.azure.com/other/Utilities/_workitems/edit/1'),
		).toThrow();
		expect(() =>
			service?.parseUrl('https://dev.azure.com/vertigis/Other/_workitems/edit/1'),
		).toThrow();
	});
	it('TODO-009/ADO-009 retains reference identity and isolates caches across organization changes', async () => {
		const original = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport(),
		);
		service = original;
		await original.refresh();
		const reference = original.parseUrl(
			'https://dev.azure.com/vertigis/Utilities/_workitems/edit/123',
		);
		const other = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic', AZURE_DEVOPS_ORG: 'other' }),
			transport(),
		);
		expect(other.url(reference)).toBe(
			'https://dev.azure.com/vertigis/Utilities/_workitems/edit/123',
		);
		expect(() => other.validate(reference)).toThrow('organization');
		expect(other.read()).toEqual([]);
	});
});
