import { describe, expect, it } from 'vitest';
import type { BoardScope, PullRequest, WorkItem } from '../../lib/contracts';
import { groupDevOpsRows } from './devops-groups';

const boards = [
	{ id: 'alpha', label: 'Utilities / Alpha', color: '#ffd166' },
	{ id: 'beta', label: 'Utilities / Beta', color: '#dc2626' },
];
const repositories = [
	{ id: 'repo-a', label: 'Repository A', color: '#8e9cff' },
	{ id: 'repo-b', label: 'Repository B', color: '#67c9aa' },
];
const mapping: BoardScope = {
	project: 'Utilities',
	boards: [
		{
			id: 'alpha',
			name: 'Alpha',
			areas: [{ path: 'Utilities\\Feature', includeChildren: true }],
		},
		{
			id: 'beta',
			name: 'Beta',
			areas: [{ path: 'Utilities\\Feature', includeChildren: false }],
		},
	],
	successAt: '2026-01-01T00:00:00Z',
	error: null,
	stale: false,
};

function work(id: number, areaPath: string | null, project = 'Utilities'): WorkItem {
	return {
		id,
		title: `Work ${id}`,
		project,
		areaPath,
		type: 'Task',
		state: 'Active',
		priority: null,
		url: `https://dev.azure.com/vertigis/Utilities/_workitems/edit/${id}`,
	};
}

function pr(id: number, repositoryId: string): PullRequest {
	return {
		id,
		repositoryId,
		repository: repositoryId,
		title: `PR ${id}`,
		project: 'Utilities',
		author: 'Author',
		draft: false,
		reviewers: [],
		reason: 'Own PR',
		url: `https://dev.azure.com/vertigis/Utilities/_git/${repositoryId}/pullrequest/${id}`,
	};
}

function groupWork(rows: WorkItem[], boardScopes: BoardScope[] = [mapping]) {
	return groupDevOpsRows({ dataset: 'work', rows, boardScopes, boards, repositories });
}

describe('local DevOps groups', () => {
	it('retains all overlapping, case-insensitive matches and distinguishes exact paths, children and unknown areas', () => {
		const rows = [
			work(1, 'utilities\\feature', 'UTILITIES'),
			work(2, 'Utilities\\Feature\\Child'),
			work(3, 'Utilities\\FeatureOther'),
			work(4, null),
		];
		const original = structuredClone(rows);
		const groups = groupWork(rows);
		expect(groups.map((group) => [group.id, group.rows.map((item) => item.row.id)])).toEqual([
			['alpha', [1, 2]],
			['beta', [1]],
			['no-team', [3]],
			['unknown-team', [4]],
		]);
		expect(groups[0]?.rows[0]?.markers).toEqual(boards);
		expect(groups[0]?.rows[1]?.markers).toEqual([boards[0]]);
		expect(rows).toEqual(original);
	});

	it.each([
		{ name: 'missing mapping', scopes: [] },
		{ name: 'never synchronized', scopes: [{ ...mapping, successAt: null }] },
		{ name: 'stale mapping', scopes: [{ ...mapping, stale: true }] },
		{ name: 'failed mapping', scopes: [{ ...mapping, error: 'Permission denied.' }] },
	])('keeps unmatched rows unknown with $name', ({ scopes }) => {
		const groups = groupWork([work(1, 'Utilities\\Other')], scopes);
		expect(groups.map((group) => group.id)).toEqual(['alpha', 'beta', 'unknown-team']);
		expect(groups[2]?.rows.map((item) => item.row.id)).toEqual([1]);
	});

	it('retains known last-good matches during a failed team refresh', () => {
		const scope = { ...mapping, stale: true, error: 'Permission denied.' };
		const groups = groupWork([work(1, 'Utilities\\Feature')], [scope]);
		expect(groups.map((group) => group.rows.length)).toEqual([1, 1]);
		expect(groups[0]?.rows[0]?.boardScope).toBe(scope);
	});

	it('requires the project and distinguishes a known empty team scope from missing metadata', () => {
		expect(groupWork([work(1, 'Utilities\\Feature', 'Other')]).at(-1)?.id).toBe('unknown-team');
		const groups = groupWork([work(1, 'Utilities\\Feature')], [{ ...mapping, boards: [] }]);
		expect(groups.at(-1)?.id).toBe('no-team');
	});

	it.each(['reviews', 'own'] as const)(
		'groups %s by repository in legend order, retaining zero counts and unknown rows',
		(dataset) => {
			const rows = [pr(2, 'repo-b'), pr(3, 'missing')];
			const groups = groupDevOpsRows({
				dataset,
				rows,
				boardScopes: [],
				boards,
				repositories,
			});
			expect(
				groups.map((group) => [group.id, group.rows.map((item) => item.row.id)]),
			).toEqual([
				['repo-a', []],
				['repo-b', [2]],
				['unknown-repository', [3]],
			]);
			expect(groups[1]?.rows[0]?.markers).toEqual([repositories[1]]);
		},
	);

	it('does not drop an unexpected row kind in an otherwise valid snapshot', () => {
		const workGroups = groupDevOpsRows({
			dataset: 'work',
			rows: [pr(1, 'repo-a')],
			boardScopes: [],
			boards,
			repositories,
		});
		const prGroups = groupDevOpsRows({
			dataset: 'own',
			rows: [work(2, null)],
			boardScopes: [],
			boards,
			repositories,
		});
		expect(workGroups.at(-1)?.id).toBe('unknown-team');
		expect(workGroups.at(-1)?.rows[0]?.row.id).toBe(1);
		expect(prGroups.at(-1)?.id).toBe('unknown-repository');
		expect(prGroups.at(-1)?.rows[0]?.row.id).toBe(2);
	});
});
