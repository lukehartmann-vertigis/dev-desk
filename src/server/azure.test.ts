import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Azure, needsReview } from './azure';
import { configuration } from './config';
import { readSettings, writeSettings } from './settings';
import { openStore, setMeta, type Store } from './store';
import { matchesBoardArea } from '../lib/contracts';

let directory: string;
let store: Store;
let service: Azure | undefined;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-ado-'));
	store = openStore(join(directory, 'test.db'));
	writeSettings(store, {
		...readSettings(store, 'vertigis'),
		boards: [0, 1].map((index) => ({
			id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
			name: `Team ${index}`,
			projectId: project,
			project: 'Utilities',
		})),
		repositories: repositories.map((repo) => ({ ...repo, projectId: project })),
	});
});
afterEach(async () => {
	await service?.stop();
	service = undefined;
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});
const user = '11111111-1111-4111-8111-111111111111';
const project = '1426d070-28f0-4cd2-9493-5b75482f174f';
const repositories = [
	{ id: '446326e4-f451-4018-99ec-e80e667cbec2', project: 'Utilities', name: 'network-locator' },
	{ id: '87401d25-3efa-41f0-b5ea-a3438dc77e6c', project: 'Utilities', name: 'Utilities' },
];
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
			swimlanesDenied?: boolean;
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
			const team = /\/teams\/([^/]+)$/.exec(path);
			if (team) {
				if (options.teamsDenied) {
					return new Response('', { status: 403 });
				}
				return Response.json({
					id: team[1],
					name: `Team ${Number(team[1]?.slice(-12))}`,
					projectId: project,
				});
			}
			if (path.endsWith('/teams')) {
				expect(url.searchParams.get('$mine')).toBe('false');
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
			if (path.includes('/_apis/work/boards')) {
				if (options.swimlanesDenied) {
					return new Response('', { status: 403 });
				}
				const board = {
					id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
					name: 'Stories',
				};
				if (path.endsWith('/boards')) {
					return Response.json({ value: [board] });
				}
				return Response.json({
					...board,
					fields: { rowField: { referenceName: 'WEF_team_Kanban.Lane' } },
					rows: [
						{ id: '00000000-0000-0000-0000-000000000000', name: null },
						{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Expedite' },
					],
					columns: [{ stateMappings: { 'Custom type': 'Done' } }],
				});
			}
			if (path.endsWith('/projects')) {
				return Response.json({ value: [{ id: project, name: 'Utilities' }] });
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
							'System.TeamProject': 'Utilities',
							'System.AssignedTo': { id: user },
							'WEF_team_Kanban.Lane': 'Expedite',
						},
					})),
				});
			}
			if (/\/workitems\/\d+$/.test(path)) {
				return Response.json({
					fields: {
						'System.TeamProject': 'Utilities',
						'System.AreaPath': 'Utilities\\Feature\\Child',
						'System.AssignedTo': { id: user },
						'System.Title': 'Synthetic work',
					},
				});
			}
			if (path.endsWith('/comments')) {
				return Response.json({ comments: [] });
			}
			if (path.endsWith('/repositories')) {
				return Response.json({
					value: repositories.map((repo) => ({
						...repo,
						project: { id: project, name: 'Utilities' },
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
			const repo = repositories.find((repo) => path.endsWith(repo.id));
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
	it('SET-005 loads selected team areas, persists them, and supports overlapping scopes', async () => {
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
			).readBoards(),
		).toEqual([]);
	});
	it('persists independent per-team board swimlanes across restart', async () => {
		const cfg = configuration({ AZURE_DEVOPS_PAT: 'synthetic' });
		service = new Azure(store, cfg, transport());
		await service.refresh();
		const scopes = service.readBoards()[0]?.swimlanes;
		expect(scopes?.['00000000-0000-4000-8000-000000000000']).toMatchObject({
			itemIds: [1],
			boards: [
				{
					name: 'Stories',
					items: [{ id: 1, laneId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }],
				},
			],
			successAt: expect.any(String),
			error: null,
			stale: false,
		});
		expect(scopes?.['00000000-0000-4000-8000-000000000001']?.itemIds).toEqual([]);
		await service.stop();
		service = new Azure(store, cfg, transport());
		expect(service.readBoards()[0]?.swimlanes).toEqual(scopes);
	});
	it('retains failed swimlane caches without blocking fresh work or PRs', async () => {
		const cfg = configuration({ AZURE_DEVOPS_PAT: 'synthetic' });
		service = new Azure(store, cfg, transport());
		await service.refresh();
		const teamId = '00000000-0000-4000-8000-000000000000';
		const previous = service.readBoards()[0]?.swimlanes?.[teamId];
		await service.stop();
		service = new Azure(store, cfg, transport({ swimlanesDenied: true }));
		await service.refresh();
		expect(service.readBoards()[0]?.swimlanes?.[teamId]).toMatchObject({
			boards: previous?.boards,
			itemIds: previous?.itemIds,
			successAt: previous?.successAt,
			error: expect.stringContaining('denied'),
			stale: true,
		});
		for (const dataset of ['work', 'own', 'reviews']) {
			expect(service.read().find((scope) => scope.dataset === dataset)).toMatchObject({
				error: null,
				stale: false,
				data: [expect.any(Object)],
			});
		}
	});
	it('distinguishes never-loaded swimlanes from a successful empty board list', async () => {
		const upstream = transport();
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) =>
				new URL(String(input)).pathname.endsWith('/boards')
					? Response.json({ value: [] })
					: upstream(input, init),
		);
		const teamId = '00000000-0000-4000-8000-000000000000';
		expect(service.readBoards()[0]?.swimlanes?.[teamId]).toMatchObject({
			boards: [],
			successAt: null,
			stale: true,
		});
		await service.refresh();
		expect(service.readBoards()[0]?.swimlanes?.[teamId]).toMatchObject({
			boards: [],
			itemIds: [1],
			successAt: expect.any(String),
			error: null,
			stale: false,
		});
	});
	it('loads all team pages before publishing board metadata', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamCount: 101 }),
		);
		const catalog = await service.discover(new AbortController().signal);
		expect(catalog.boards).toHaveLength(101);
		expect(catalog.errors).toEqual([]);
	});
	it.each(['teamsDenied', 'settingsDenied', 'unsupportedField'] as const)(
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
				stale: true,
				error: expect.any(String),
			});
			expect(service.read().find((scope) => scope.dataset === 'own')?.data).toHaveLength(1);
		},
	);
	it('SET-005 resolves selected area scopes before querying assigned work', async () => {
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
		expect(paths.findIndex((path) => path.endsWith('/teamfieldvalues'))).toBeLessThan(
			paths.findIndex((path) => path.endsWith('/wiql')),
		);
	});
	it('SET-004/009 keeps resolved labels across an offline save without changing source identities', async () => {
		service = new Azure(store, configuration({}));
		const saved = service.selection;
		const renamed = saved.repositories.map((source) => ({
			...source,
			name: `Renamed ${source.name}`,
		}));
		for (const source of renamed) {
			setMeta(store, `vertigis:source:repositories:${source.id}`, JSON.stringify(source));
		}
		expect(service.selection.repositories).toEqual(renamed);
		await service.saveSelection(
			{
				revision: saved.revision,
				boards: saved.boards.map(({ id, projectId }) => ({ id, projectId })),
				repositories: saved.repositories.map(({ id, projectId }) => ({ id, projectId })),
			},
			new AbortController().signal,
		);
		expect(service.selection.repositories).toEqual(renamed);
		expect(readSettings(store, 'vertigis').repositories).toEqual(renamed);
	});
	it.each([
		{ 'System.TeamProject': 'Another project' },
		{ 'System.AssignedTo': { id: 'another-user' } },
		{ 'System.AreaPath': 'Utilities\\FeatureSibling' },
	])(
		'SET-005 rechecks returned work against project, assignment and area: %j',
		async (fields) => {
			const upstream = transport();
			service = new Azure(
				store,
				configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
				async (input, init) => {
					const response = await upstream(input, init);
					if (new URL(String(input)).pathname.endsWith('/workitemsbatch')) {
						const data = await response.json();
						data.value[0].fields = { ...data.value[0].fields, ...fields };
						return Response.json(data);
					}
					return response;
				},
			);
			await service.refresh();
			expect(service.read().find((scope) => scope.dataset === 'work')?.data).toEqual([]);
		},
	);
	it('SET-009 keeps an independently readable selected board usable when another has no metadata', async () => {
		const upstream = transport();
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) => {
				const path = new URL(String(input)).pathname;
				if (path.includes('8000-000000000001/_apis/work/teamsettings')) {
					return new Response('', { status: 403 });
				}
				return upstream(input, init);
			},
		);
		await service.refresh();
		const work = service.read().find((scope) => scope.dataset === 'work');
		expect(work?.data).toHaveLength(1);
		expect(work).toMatchObject({ stale: true, error: expect.any(String) });
	});
	it('SET-009 reports unavailable scopes without falling back to project-wide work', async () => {
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamsDenied: true }),
		);
		await service.refresh();
		expect(service.readBoards()[0]).toMatchObject({
			boards: expect.arrayContaining([expect.objectContaining({ areas: [] })]),
			successAt: null,
			stale: true,
			error: expect.stringContaining('denied'),
		});
		expect(service.read().find((scope) => scope.dataset === 'work')?.data).toHaveLength(0);
		expect(service.read().find((scope) => scope.dataset === 'own')?.data).toHaveLength(1);
	});
	it('SET-005 does not assume older cached work with unknown area is selected', async () => {
		service = new Azure(store, configuration({ AZURE_DEVOPS_PAT: 'synthetic' }), transport());
		expect(service.readBoards()[0]).toMatchObject({ successAt: null, stale: true });
		await service.refresh();
		expect(service.readBoards()[0]).toMatchObject({
			boards: expect.any(Array),
			successAt: expect.any(String),
			error: null,
			stale: false,
		});
		store.sqlite
			.prepare(
				"UPDATE snapshots SET data = json_remove(data, '$[0].areaPath') WHERE dataset = 'work'",
			)
			.run();
		expect(service.read().find((scope) => scope.dataset === 'work')?.data).toEqual([]);
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
		).toMatchObject({ kind: 'pullRequest', repositoryId: repositories[0]?.id });
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
	it('SET-002 surfaces repeated team pages and never enables discovered sources', async () => {
		writeSettings(store, { ...readSettings(store, 'vertigis'), boards: [], repositories: [] });
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ teamCount: 100, repeatTeams: true }),
		);
		const catalog = await service.discover(new AbortController().signal);
		expect(catalog.errors.join(' ')).toContain('did not advance');
		expect(catalog.repositories).toHaveLength(2);
		expect(service.selection.boards).toEqual([]);
		expect(service.selection.repositories).toEqual([]);
	});
	it('SET-008 immediately hides deselected cached data and rejects remembered references', async () => {
		service = new Azure(store, configuration({ AZURE_DEVOPS_PAT: 'synthetic' }), transport());
		await service.refresh();
		const reference = service.parseUrl(
			'https://dev.azure.com/vertigis/Utilities/_workitems/edit/1',
		);
		writeSettings(store, { ...service.selection, boards: [], repositories: [] });
		expect(service.read()).toEqual([]);
		expect(service.repositories).toEqual([]);
		await expect(service.detail(reference, new AbortController().signal)).rejects.toThrow(
			'selected',
		);
	});
	it('SET-007 verifies area and assignment before reading work-item discussions', async () => {
		const upstream = transport();
		const paths: string[] = [];
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) => {
				const path = new URL(String(input)).pathname;
				paths.push(path);
				if (/\/workitems\/\d+$/.test(path)) {
					return Response.json({
						fields: {
							'System.TeamProject': 'Utilities',
							'System.AreaPath': 'Utilities\\Other',
							'System.AssignedTo': { id: user },
						},
					});
				}
				return upstream(input, init);
			},
		);
		await service.refresh();
		await expect(
			service.detail(
				{ kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 1 },
				new AbortController().signal,
			),
		).rejects.toThrow('selected team area');
		expect(paths.some((path) => path.endsWith('/comments'))).toBe(false);
	});
	it('SET-003 validates additions, keeps selections on failure, and allows offline removal', async () => {
		writeSettings(store, { ...readSettings(store, 'vertigis'), boards: [], repositories: [] });
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			transport({ settingsDenied: true }),
		);
		await expect(
			service.saveSelection(
				{
					revision: service.selection.revision,
					boards: [{ id: '00000000-0000-4000-8000-000000000000', projectId: project }],
					repositories: [],
				},
				new AbortController().signal,
			),
		).rejects.toThrow('denied');
		expect(service.selection.boards).toEqual([]);
		const offline = new Azure(store, configuration({}));
		await offline.saveSelection(
			{ revision: offline.selection.revision, boards: [], repositories: [] },
			new AbortController().signal,
		);
		expect(offline.selection.boards).toEqual([]);
	});
	it('SET-006 enables repositories without any board selection or work-item requests', async () => {
		writeSettings(store, { ...readSettings(store, 'vertigis'), boards: [], repositories: [] });
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
		await service.saveSelection(
			{
				revision: service.selection.revision,
				boards: [],
				repositories: repositories.map((repo) => ({ id: repo.id, projectId: project })),
			},
			new AbortController().signal,
		);
		await service.refresh();
		expect(service.readBoards()).toEqual([]);
		expect(service.read().filter((scope) => scope.dataset === 'own')).toHaveLength(2);
		expect(paths.some((path) => /wiql|teamfieldvalues/.test(path))).toBe(false);
	});
	it('SET-003/005 saves validated boards and repositories together and adopts the new scope', async () => {
		writeSettings(store, { ...readSettings(store, 'vertigis'), boards: [], repositories: [] });
		service = new Azure(store, configuration({ AZURE_DEVOPS_PAT: 'synthetic' }), transport());
		await service.saveSelection(
			{
				revision: service.selection.revision,
				boards: [{ id: '00000000-0000-4000-8000-000000000000', projectId: project }],
				repositories: repositories
					.slice(0, 1)
					.map(({ id }) => ({ id, projectId: project })),
			},
			new AbortController().signal,
		);
		await service.refresh();
		expect(service.selection.boards).toHaveLength(1);
		expect(service.selection.repositories).toHaveLength(1);
		expect(service.read()).toHaveLength(3);
		expect(
			service.read().map(({ dataset, data }) => ({ dataset, count: data.length })),
		).toEqual(
			expect.arrayContaining([
				{ dataset: 'work', count: 1 },
				{ dataset: 'own', count: 1 },
				{ dataset: 'reviews', count: 1 },
			]),
		);
	});
	it('SET-008 discards an in-flight work result after saving empty scope and follows up without overlap', async () => {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const upstream = transport();
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) => {
				if (new URL(String(input)).pathname.endsWith('/wiql')) {
					started.resolve();
					await release.promise;
				}
				return upstream(input, init);
			},
		);
		const pending = service.refresh();
		await started.promise;
		await service.saveSelection(
			{ revision: service.selection.revision, boards: [], repositories: [] },
			new AbortController().signal,
		);
		release.resolve();
		await pending;
		await service.refresh();
		expect(service.read()).toEqual([]);
		expect(
			store.sqlite
				.prepare("SELECT COUNT(*) AS count FROM snapshots WHERE dataset = 'work'")
				.get(),
		).toEqual({ count: 0 });
	});
	it('SET-007 rejects detail results superseded while awaiting an upstream response', async () => {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const upstream = transport();
		const paths: string[] = [];
		service = new Azure(
			store,
			configuration({ AZURE_DEVOPS_PAT: 'synthetic' }),
			async (input, init) => {
				const path = new URL(String(input)).pathname;
				paths.push(path);
				if (/\/workitems\/\d+$/.test(path)) {
					started.resolve();
					await release.promise;
				}
				return upstream(input, init);
			},
		);
		await service.refresh();
		const pending = service.detail(
			{ kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 1 },
			new AbortController().signal,
		);
		const rejected = expect(pending).rejects.toThrow('sources changed');
		await started.promise;
		writeSettings(store, { ...service.selection, boards: [] });
		release.resolve();
		await rejected;
		expect(paths.some((path) => path.endsWith('/comments'))).toBe(false);
	});
});
