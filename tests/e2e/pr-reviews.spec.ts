import { expect, test } from '@playwright/test';
import { dashboardSchema, type PullRequest, type Reviewer } from '../../src/lib/contracts';
import { syntheticRepositories } from './fixtures';

const reviewers: Reviewer[] = [
	{ id: 'alice', name: 'Alice', vote: 10, required: true, group: false },
	{ id: 'qa', name: 'QA team', vote: 10, required: true, group: true },
	{ id: 'bob', name: 'Bob', vote: 5, required: false, group: false },
	{ id: 'dev', name: 'Dev team', vote: -5, required: true, group: true },
	{ id: 'carol', name: 'Carol', vote: -5, required: false, group: false },
	{ id: 'dan', name: 'Dan', vote: -10, required: false, group: false },
	{ id: 'eve', name: 'Eve', vote: 0, required: false, group: false },
	{ id: 'frank', name: 'Frank', vote: null, required: false, group: false },
	{ id: 'grace', name: 'Grace', vote: 42, required: false, group: false },
	{ id: 'long', name: 'LongReviewerName'.repeat(12), vote: 0, required: false, group: false },
];

for (const width of [375, 1440]) {
	test(`PR review chips: status colors, grouped layout and edge cases at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		const repository = syntheticRepositories[0];
		state.ado.repositories = syntheticRepositories;
		state.ado.selection = { revision: 1, boards: 0, repositories: 2 };
		const mixed: PullRequest = {
			id: 101,
			title: 'Mixed reviewers',
			project: repository.project,
			repositoryId: repository.id,
			repository: repository.name,
			author: 'Author',
			draft: false,
			url: `https://dev.azure.com/vertigis/${repository.project}/_git/${repository.id}/pullrequest/101`,
			reason: 'Group request',
			reviewers,
		};
		const rows: PullRequest[] = [
			mixed,
			{
				...mixed,
				id: 102,
				title: 'Groups only',
				reviewers: reviewers.filter((reviewer) => reviewer.group),
			},
			{
				...mixed,
				id: 103,
				title: 'Individuals only',
				reviewers: reviewers.filter((reviewer) => !reviewer.group),
			},
			{ ...mixed, id: 104, title: 'No reviewers', reviewers: [] },
		];
		state.ado = {
			...state.ado,
			state: 'ready',
			snapshots: (['reviews', 'own'] as const).map((dataset) => ({
				scope: `vertigis:${dataset}:${repository.id}`,
				dataset,
				data: rows,
				successAt: new Date().toISOString(),
				error: null,
				stale: false,
			})),
		};
		await page.route('**/api/state', (route) => route.fulfill({ json: state }));
		await page.goto('/');

		for (const tab of [/^Review requests/, /^Your pull requests/]) {
			await page.getByRole('tab', { name: tab }).click();
			const row = page.locator('.work-row').filter({ hasText: 'Mixed reviewers' });
			const summary = row.locator('summary');
			await expect(summary).toHaveText(`Review votes (${reviewers.length})`);
			await expect(row.getByRole('list')).toHaveCount(0);
			await summary.focus();
			await page.keyboard.press('Enter');
			const groups = row.getByRole('list', { name: 'Group reviews', exact: true });
			const individuals = row.getByRole('list', { name: 'Individual reviews', exact: true });
			await expect(groups.getByRole('listitem')).toHaveText([
				'QA team (required): Approved',
				'Dev team (required): Waiting for author',
			]);
			await expect(individuals.getByRole('listitem')).toHaveText([
				'Alice (required): Approved',
				'Bob: Approved with suggestions',
				'Carol: Waiting for author',
				'Dan: Rejected',
				'Eve: No vote',
				'Frank: Vote unavailable',
				'Grace: Vote 42',
				`${reviewers.at(-1)?.name}: No vote`,
			]);
			await expect(row.getByRole('list').first()).toHaveAttribute(
				'aria-label',
				'Group reviews',
			);
			for (const [name, color] of [
				['Alice', 'rgb(134, 239, 172)'],
				['Bob', 'rgb(134, 239, 172)'],
				['Carol', 'rgb(252, 211, 77)'],
				['Dan', 'rgb(252, 165, 165)'],
				['Eve', 'rgb(160, 172, 189)'],
				['Frank', 'rgb(160, 172, 189)'],
				['Grace', 'rgb(160, 172, 189)'],
			] as const) {
				const chip = individuals.getByRole('listitem').filter({ hasText: name });
				await expect(chip).toHaveCSS('color', color);
				await expect(chip.locator('svg')).toHaveAttribute('aria-hidden', 'true');
			}
			const geometry = await row.getByRole('list').evaluateAll((lists) =>
				lists.map((list) => ({
					top: list.getBoundingClientRect().top,
					bottom: list.getBoundingClientRect().bottom,
					chips: Array.from(list.children, (chip) => {
						const bounds = chip.getBoundingClientRect();
						return { left: bounds.left, right: bounds.right, top: bounds.top };
					}),
				})),
			);
			expect(geometry).toHaveLength(2);
			const [groupGeometry, individualGeometry] = geometry;
			if (!groupGeometry || !individualGeometry) {
				throw new Error('Missing reviewer row geometry');
			}
			expect(groupGeometry.bottom).toBeLessThan(individualGeometry.top);
			for (const list of geometry) {
				expect(list.chips.every((chip) => chip.left >= 0 && chip.right <= width)).toBe(
					true,
				);
				if (width === 1440) {
					const [first, second] = list.chips;
					if (!first || !second) {
						throw new Error('Missing adjacent review chips');
					}
					expect(first.top).toBe(second.top);
					expect(first.right).toBeLessThan(second.left);
				}
			}
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
			await summary.click();
			await expect(groups).not.toBeVisible();
			await expect(individuals).not.toBeVisible();

			for (const [title, label, count] of [
				['Groups only', 'Group reviews', 2],
				['Individuals only', 'Individual reviews', 8],
				['No reviewers', '', 0],
			] as const) {
				const single = page.locator('.work-row').filter({ hasText: title });
				await single.locator('summary').click();
				await expect(single.getByRole('list')).toHaveCount(count === 0 ? 0 : 1);
				if (count > 0) {
					await expect(
						single.getByRole('list', { name: label }).getByRole('listitem'),
					).toHaveCount(count);
				}
			}
		}
	});
}
