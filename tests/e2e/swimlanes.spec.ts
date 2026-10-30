import { expect, test } from '@playwright/test';
import { dashboardSchema, type SwimlaneScope, type WorkItem } from '../../src/lib/contracts';

const alpha = '11111111-1111-4111-8111-111111111111';
const beta = '22222222-2222-4222-8222-222222222222';
const stories = '33333333-3333-4333-8333-333333333333';
const features = '44444444-4444-4444-8444-444444444444';
const defaultLane = '00000000-0000-0000-0000-000000000000';
const expedite = '55555555-5555-4555-8555-555555555555';

function laneScope(): SwimlaneScope {
	return {
		boards: [
			{
				id: stories,
				name: 'Stories',
				lanes: [
					{ id: expedite, name: 'Expedite' },
					{ id: defaultLane, name: null },
				],
				items: [
					{ id: 1, laneId: defaultLane },
					{ id: 2, laneId: expedite },
					{ id: 3, laneId: null },
				],
			},
			{
				id: features,
				name: 'Features',
				lanes: [{ id: expedite, name: 'Expedite' }],
				items: [{ id: 1, laneId: expedite }],
			},
		],
		itemIds: [1, 2, 3, 4],
		successAt: new Date().toISOString(),
		error: null,
		stale: false,
	};
}

for (const width of [375, 768, 1440]) {
	test(`ADO-003: board swimlane expanders retain all work and support keyboard at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		const rows: WorkItem[] = [
			'Default work',
			'Expedited work',
			'Unknown lane work',
			'Custom unmapped work',
			'New uncached work',
		].map((title, index) => ({
			id: index + 1,
			title,
			project: 'Project',
			areaPath: 'Project',
			type: 'Story',
			state: 'Active',
			priority: null,
			url: `https://dev.azure.com/org/Project/_workitems/edit/${index + 1}`,
		}));
		const lanes = laneScope();
		const otherTeam = laneScope();
		otherTeam.boards = [
			{
				...lanes.boards[0]!,
				items: rows.map((row) => ({ id: row.id, laneId: expedite })),
			},
		];
		state.ado = {
			...state.ado,
			state: 'ready',
			selection: { revision: 1, boards: 2, repositories: 0 },
			boardScopes: [
				{
					project: 'Project',
					boards: [alpha, beta].map((id, index) => ({
						id,
						name: index ? 'Beta' : 'Alpha',
						areas: [{ path: 'Project', includeChildren: true }],
					})),
					swimlanes: { [alpha]: lanes, [beta]: otherTeam },
					successAt: new Date().toISOString(),
					error: null,
					stale: false,
				},
			],
			snapshots: [
				{
					scope: 'synthetic:work:Project',
					dataset: 'work',
					data: rows,
					successAt: new Date().toISOString(),
					error: null,
					stale: false,
				},
			],
		};
		let reads = 0;
		const mutations: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/api/') && request.method() !== 'GET') {
				mutations.push(request.url());
			}
		});
		await page.route('**/api/state', (route) => {
			reads += 1;
			return route.fulfill({ json: state });
		});
		await page.goto('/');
		const groups = page.locator('.swimlane-group');
		await expect(groups.locator('summary')).toHaveText([
			'Stories / Expedite 1 item',
			'Stories / Default swimlane 1 item',
			'Stories / Swimlane unavailable 1 item',
			'Features / Expedite 1 item',
			'Not mapped to a board 1 item',
			'Swimlane unavailable 1 item',
		]);
		await expect(groups).toHaveCount(6);
		await expect(page.getByRole('tab', { name: /^Assigned work items/ })).toContainText(
			'5 items',
		);
		for (const group of await groups.all()) {
			await expect(group).toHaveAttribute('open', '');
		}
		const storiesDefault = groups.filter({
			has: page.locator('summary', { hasText: 'Stories / Default swimlane' }),
		});
		const defaultWork = storiesDefault.getByRole('link', {
			name: '#1 Default work',
			exact: true,
		});
		const summary = storiesDefault.locator('summary');
		const before = reads;
		await summary.click();
		await expect(defaultWork).not.toBeVisible();
		await expect(storiesDefault).not.toHaveAttribute('open');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(defaultWork).toBeVisible();
		await page.keyboard.press('Space');
		await expect(defaultWork).not.toBeVisible();
		expect(reads).toBe(before);
		await page.evaluate(() => window.dispatchEvent(new Event('focus')));
		await expect.poll(() => reads).toBe(before + 1);
		await expect(storiesDefault).not.toHaveAttribute('open');
		await expect(defaultWork).not.toBeVisible();
		await page.keyboard.press('Enter');
		await expect(
			groups
				.filter({ hasText: 'Features / Expedite' })
				.getByRole('link', { name: '#1 Default work', exact: true }),
		).toBeVisible();
		const chips = page.getByRole('group', { name: 'Filter work items by team' });
		await chips.getByRole('button', { name: 'Project / Beta, 5 items', exact: true }).click();
		await expect(groups).toHaveCount(1);
		await expect(groups.locator('summary')).toHaveText('Stories / Expedite 5 items');
		await expect(groups.locator('.work-row')).toHaveCount(5);
		await chips.getByRole('button', { name: 'Project / Alpha, 5 items', exact: true }).click();
		await expect(groups).toHaveCount(6);
		expect(mutations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true,
		);

		lanes.stale = true;
		lanes.error = 'Synthetic swimlane access denied.';
		await page.reload();
		await expect(
			page.getByText('Swimlane mapping stale or incomplete:', { exact: false }),
		).toBeVisible();
		await expect(page.getByText(/Synthetic swimlane access denied/)).toBeVisible();
		await expect(
			page.getByRole('tab', { name: /^Assigned work items/ }).locator('.tab-warning'),
		).toBeVisible();
		await expect(groups.filter({ hasText: 'Not mapped to a board' })).toHaveCount(0);
		await expect(groups.last().locator('.work-row')).toHaveCount(2);
		await expect(
			page.getByRole('link', { name: '#2 Expedited work', exact: true }),
		).toBeVisible();
	});
}
