import { describe, expect, it } from 'vitest';
import type { WorkItem } from '../lib/contracts';
import { loadSwimlanes } from './azure-swimlanes';

const source = {
	id: '11111111-1111-4111-8111-111111111111',
	projectId: '22222222-2222-4222-8222-222222222222',
	project: 'Project',
	name: 'Team',
};
const defaultId = '00000000-0000-0000-0000-000000000000';
const expediteId = '33333333-3333-4333-8333-333333333333';
const boards = [
	{ id: '44444444-4444-4444-8444-444444444444', name: 'Stories' },
	{ id: '55555555-5555-4555-8555-555555555555', name: 'Features' },
];
const items: WorkItem[] = Array.from({ length: 201 }, (_, index) => ({
	id: index + 1,
	project: source.project,
	title: `Work ${index + 1}`,
	type: index === 200 ? 'Custom task' : 'Story',
	state: 'Active',
	priority: null,
	areaPath: source.project,
	url: `https://dev.azure.com/org/Project/_workitems/edit/${index + 1}`,
}));
const signal = new AbortController().signal;

describe('board-specific swimlane loading', () => {
	function request(
		failure?:
			'missing' | 'duplicate' | 'foreign' | 'invalid-lane' | 'continuation' | 'board-id',
	) {
		const batches: { ids: number[]; fields: string[] }[] = [];
		const fetch: Parameters<typeof loadSwimlanes>[0] = async (path, options) => {
			if (path.endsWith('/boards')) {
				return {
					data: { value: boards },
					continuation: failure === 'continuation' ? 'more' : null,
				};
			}
			const index = boards.findIndex((board) => path.endsWith(board.id));
			if (index !== -1) {
				return {
					data: {
						...boards[index],
						...(failure === 'board-id' ? { id: source.id } : {}),
						fields: { rowField: { referenceName: `WEF_board${index}_Kanban.Lane` } },
						rows: [
							{ id: expediteId, name: 'Expedite' },
							{ id: defaultId, name: 'Renamed default' },
						],
						columns: [{ stateMappings: { Story: 'Active' } }],
					},
					continuation: null,
				};
			}
			const body = options.body as { ids: number[]; fields: string[]; errorPolicy: string };
			expect(path).toBe(`${source.projectId}/_apis/wit/workitemsbatch`);
			expect(body.errorPolicy).toBe('Fail');
			expect(body.ids.length).toBeLessThanOrEqual(200);
			batches.push(body);
			const value = body.ids.map((id) => {
				const lane = id === 2 ? 'Deleted lane' : '';
				return {
					id,
					fields: {
						...(id !== 1 ? { 'WEF_board0_Kanban.Lane': 'Expedite' } : {}),
						'WEF_board1_Kanban.Lane': failure === 'invalid-lane' ? 42 : lane,
						'System.BoardLane': 'Wrong board value',
					},
				};
			});
			if (failure === 'missing') {
				value.pop();
			} else if (failure === 'duplicate' && value[0] && value[1]) {
				value[1].id = value[0].id;
			} else if (failure === 'foreign' && value[0]) {
				value[0].id = 99999;
			}
			return { data: { value }, continuation: null };
		};
		return { fetch, batches };
	}

	it('uses each board field, preserves row order, resolves a reordered default, and batches all IDs', async () => {
		const { fetch, batches } = request();
		const result = await loadSwimlanes(fetch, source, items, signal);
		expect(batches.map((batch) => batch.ids.length)).toEqual([200, 1]);
		expect(batches[0]?.fields).toEqual(['WEF_board0_Kanban.Lane', 'WEF_board1_Kanban.Lane']);
		expect(result.map((board) => board.name)).toEqual(['Stories', 'Features']);
		expect(result[0]?.lanes.map((lane) => lane.id)).toEqual([expediteId, defaultId]);
		expect(result[0]?.items.slice(0, 2)).toEqual([
			{ id: 1, laneId: defaultId },
			{ id: 2, laneId: expediteId },
		]);
		expect(result[1]?.items.slice(0, 2)).toEqual([
			{ id: 1, laneId: defaultId },
			{ id: 2, laneId: null },
		]);
		expect(result.every((board) => board.items.length === 200)).toBe(true);
		expect(result.every((board) => !board.items.some((item) => item.id === 201))).toBe(true);
	});

	it.each([
		'missing',
		'duplicate',
		'foreign',
		'invalid-lane',
		'continuation',
		'board-id',
	] as const)('rejects %s responses instead of publishing a partial cache', async (failure) => {
		await expect(
			loadSwimlanes(request(failure).fetch, source, items, signal),
		).rejects.toThrow();
	});

	it('keeps board metadata for empty assigned work without issuing item batches', async () => {
		const { fetch, batches } = request();
		const result = await loadSwimlanes(fetch, source, [], signal);
		expect(result).toHaveLength(2);
		expect(result.every((board) => board.items.length === 0)).toBe(true);
		expect(batches).toEqual([]);
	});
});
