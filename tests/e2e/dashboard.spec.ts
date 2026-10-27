import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { dashboardSchema, type BoardScope } from '../../src/lib/contracts';

const headers = {
	'Content-Type': 'application/json',
	'X-Devdesk-Request': '1',
	Origin: new URL(process.env.DEVDESK_TEST_URL ?? 'http://127.0.0.1:3000').origin,
};

test('TODO-001/003/004/005/006/007: real persistent todo workflow and confirmed deletion', async ({
	page,
}) => {
	const title = `Workflow ${randomUUID()}`;
	await page.goto('/');
	await page.getByRole('textbox', { name: 'New todo' }).fill(title);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title}`, exact: true }),
	).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New todo' })).toBeFocused();
	await page.reload();
	await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
	await page.getByRole('textbox', { name: 'Todo title' }).fill(`${title} edited`);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await page.getByRole('checkbox', { name: `Complete ${title} edited`, exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title} edited`, exact: true }),
	).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: `Reopen ${title} edited` })).not.toBeVisible();
	await page.locator('summary').filter({ hasText: 'Completed (' }).click();
	await page.getByRole('checkbox', { name: `Reopen ${title} edited`, exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title} edited`, exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: `Delete ${title} edited`, exact: true }).click();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title} edited`, exact: true }),
	).toBeVisible();
	await page.getByRole('button', { name: `Delete ${title} edited`, exact: true }).click();
	await page.getByRole('button', { name: 'Delete permanently' }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title} edited`, exact: true }),
	).toHaveCount(0);
});

test('TODO-008/UX-003: pointer and keyboard ordering persists', async ({ page }) => {
	const prefix = randomUUID();
	await page.goto('/');
	for (const suffix of ['one', 'two']) {
		await page.getByRole('textbox', { name: 'New todo' }).fill(`${prefix} ${suffix}`);
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(
			page.getByRole('checkbox', { name: `Complete ${prefix} ${suffix}` }),
		).toBeVisible();
	}
	await page.getByRole('button', { name: `Move ${prefix} two up`, exact: true }).focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} two`,
	);
	await page.reload();
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} two`,
	);
	await page
		.locator('.todo-row')
		.filter({ hasText: `${prefix} one` })
		.dragTo(page.locator('.todo-row').filter({ hasText: `${prefix} two` }));
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} one`,
	);
});

test('TODO-009/OPS-005: references stay usable and explicitly unverified without an upstream token', async ({
	page,
}) => {
	const title = `Reference ${randomUUID()}`;
	await page.goto('/');
	await page.getByRole('textbox', { name: 'New todo' }).fill(title);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('button', { name: `Edit ${title}`, exact: true }).click();
	await page
		.getByRole('textbox', { name: 'External reference' })
		.fill('https://dev.azure.com/vertigis/Utilities/_workitems/edit/123');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	const row = page.locator('.todo-row').filter({ hasText: title });
	await expect(row.getByRole('link', { name: 'Work item #123' })).toHaveAttribute(
		'href',
		'https://dev.azure.com/vertigis/Utilities/_workitems/edit/123',
	);
	await expect(row).toContainText('Unverified reference');
	await row.getByRole('button', { name: 'Check reference' }).click();
	await expect(row).toContainText('Unavailable:');
	await page.getByRole('checkbox', { name: `Complete ${title}`, exact: true }).click();
	await expect(
		page.getByRole('checkbox', { name: `Complete ${title}`, exact: true }),
	).toHaveCount(0);
});

test('TODO-001/UX-007: oversized titles are rejected without truncation or lost input', async ({
	page,
	request,
}) => {
	const title = randomUUID() + 'x'.repeat(465);
	expect(title.length).toBe(501);
	await page.goto('/');
	await page.getByRole('textbox', { name: 'New todo' }).fill(title);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Use at most 500 characters.' }),
	).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New todo' })).toHaveValue(title);
	const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
	expect(state.todos.items.some((todo) => todo.title.startsWith(title.slice(0, 36)))).toBe(false);
});
test('TODO-010/011: multi-client conflicts and interrupted-response retry identities', async ({
	request,
}) => {
	const requestId = randomUUID(),
		title = `Concurrency ${requestId}`;
	const create = { kind: 'create', requestId, title, reference: null };
	expect((await request.post('/api/todos', { headers, data: create })).ok()).toBe(true);
	const replay = dashboardSchema.parse(
		await (await request.post('/api/todos', { headers, data: create })).json(),
	);
	expect(replay.todos.items.filter((todo) => todo.title === title)).toHaveLength(1);
	const todo = replay.todos.items.find((todo) => todo.title === title);
	if (!todo) throw new Error('Missing created todo');
	const edit = {
		kind: 'edit',
		requestId: randomUUID(),
		id: todo.id,
		revision: todo.revision,
		title: `${title} updated`,
		reference: null,
	};
	expect((await request.post('/api/todos', { headers, data: edit })).ok()).toBe(true);
	expect(
		(
			await request.post('/api/todos', {
				headers,
				data: { ...edit, requestId: randomUUID(), title: 'Stale' },
			})
		).status(),
	).toBe(409);
	expect(
		(
			await request.post('/api/todos', { headers, data: { ...create, title: 'Reused ID' } })
		).status(),
	).toBe(409);
});

test('OPS-002: cross-origin and unmarked mutations are rejected', async ({ request }) => {
	const data = { kind: 'create', requestId: randomUUID(), title: 'Forbidden', reference: null };
	expect(
		(
			await request.post('/api/todos', {
				headers: { ...headers, Origin: 'https://evil.test' },
				data,
			})
		).status(),
	).toBe(403);
	expect(
		(await request.post('/api/todos', { headers: { Origin: headers.Origin }, data })).status(),
	).toBe(415);
});

test('UX-003: dialogs dismiss with Escape and return keyboard focus', async ({ page }) => {
	const title = `Keyboard ${randomUUID()}`;
	await page.goto('/');
	await page.getByRole('textbox', { name: 'New todo' }).fill(title);
	await page.keyboard.press('Enter');
	const edit = page.getByRole('button', { name: `Edit ${title}`, exact: true });
	await edit.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).not.toBeVisible();
	await expect(edit).toBeFocused();
});

for (const width of [375, 768, 1440]) {
	test(`UX-002/004: usable layout at ${width}px with reduced motion`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Your todos' })).toBeVisible();
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBe(true);
		if (width < 1200) {
			await page.getByRole('button', { name: 'Open chat' }).click();
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.getByRole('button', { name: 'Open chat' })).toBeFocused();
		} else {
			await expect(page.getByRole('heading', { name: 'Copilot assistant' })).toBeVisible();
			await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
		}
	});
}

test('OPS-003/005: missing integration credentials do not block readiness or todos', async ({
	request,
	page,
}) => {
	const health = await request.get('/api/health');
	expect(health.ok()).toBe(true);
	await page.goto('/');
	await expect(page.getByText('Azure DevOps: not configured')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New todo' })).toBeEnabled();
	expect(
		(
			await request.post('/api/chat', {
				headers,
				data: { prompt: 'Hello', requestId: randomUUID() },
			})
		).status(),
	).toBe(503);
});

test('ADO-003/004/005/008/010, UX-005/OPS-007: populated tabs, safe text and distinct legends', async ({
	page,
	request,
}) => {
	const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
	const repository = state.ado.repositories[0];
	if (!repository) throw new Error('Missing configured repository');
	const secondRepository = state.ado.repositories[1];
	if (!secondRepository) throw new Error('Missing second configured repository');
	const mapping: BoardScope = {
		project: 'Utilities',
		boards: [
			{
				id: '33333333-3333-4333-8333-333333333333',
				name: 'Alpha board',
				areas: [{ path: 'Utilities\\Feature', includeChildren: true }],
			},
			{
				id: '44444444-4444-4444-8444-444444444444',
				name: 'Beta board',
				areas: [{ path: 'Utilities\\Feature', includeChildren: false }],
			},
		],
		successAt: new Date().toISOString(),
		error: null,
		stale: false,
	};
	const title = '<img src=x onerror="window.devdeskInjected=true"> Synthetic work';
	const pr = {
		id: 8,
		title: 'Synthetic review',
		project: 'Utilities',
		repositoryId: repository.id,
		repository: repository.name,
		author: 'Synthetic author',
		draft: true,
		url: `https://dev.azure.com/vertigis/Utilities/_git/${repository.id}/pullrequest/8`,
		reviewers: [{ id: 'group', name: 'Synthetic group', vote: 0, required: true, group: true }],
		reason: 'Group request',
	};
	state.ado = {
		...state.ado,
		state: 'ready',
		message: 'Configured synthetic acceptance state.',
		boardScopes: [mapping],
		snapshots: [
			{
				scope: 'vertigis:work:Utilities',
				dataset: 'work',
				data: [
					{
						id: 7,
						title,
						project: 'Utilities',
						type: 'Custom work type',
						state: 'Done',
						priority: null,
						areaPath: 'utilities\\feature',
						url: 'https://dev.azure.com/vertigis/Utilities/_workitems/edit/7',
					},
					...[
						{ id: 10, title: 'Child area work', areaPath: 'Utilities\\Feature\\Child' },
						{
							id: 11,
							title: 'Unmatched area work',
							areaPath: 'Utilities\\FeatureOther',
						},
						{ id: 12, title: 'Unknown area work', areaPath: null },
					].map((item) => ({
						...item,
						project: 'Utilities',
						type: 'Task',
						state: 'Active',
						priority: 2,
						url: `https://dev.azure.com/vertigis/Utilities/_workitems/edit/${item.id}`,
					})),
				],
				successAt: new Date().toISOString(),
				error: 'Synthetic upstream outage; last-good data retained.',
				stale: true,
			},
			{
				scope: `vertigis:reviews:${repository.id}`,
				dataset: 'reviews',
				data: [pr],
				successAt: new Date().toISOString(),
				error: null,
				stale: false,
			},
			{
				scope: `vertigis:own:${secondRepository.id}`,
				dataset: 'own',
				data: [
					{
						...pr,
						id: 13,
						repositoryId: secondRepository.id,
						repository: secondRepository.name,
						title: 'Other repository PR',
						url: `https://dev.azure.com/vertigis/Utilities/_git/${secondRepository.id}/pullrequest/13`,
					},
				],
				successAt: new Date().toISOString(),
				error: null,
				stale: false,
			},
			{
				scope: `vertigis:own:${repository.id}`,
				dataset: 'own',
				data: [
					{
						...pr,
						id: 9,
						title: 'Synthetic own PR',
						url: `https://dev.azure.com/vertigis/Utilities/_git/${repository.id}/pullrequest/9`,
					},
				],
				successAt: new Date().toISOString(),
				error: null,
				stale: false,
			},
		],
	};
	await page.route('**/api/state', (route) => route.fulfill({ json: state }));
	await page.goto('/');
	const workTab = page.getByRole('tab', { name: /^Assigned work items/ }),
		reviewTab = page.getByRole('tab', { name: /^Review requests/ }),
		ownTab = page.getByRole('tab', { name: /^Your pull requests/ });
	await expect(page.getByRole('tab')).toHaveCount(3);
	await expect(page.getByRole('tabpanel')).toHaveCount(1);
	await expect(workTab).toHaveAttribute('aria-selected', 'true');
	await expect(workTab.locator('.tab-count')).toHaveText('4 items');
	await expect(reviewTab.locator('.tab-count')).toHaveText('1 item');
	await expect(ownTab.locator('.tab-count')).toHaveText('2 items');
	await expect(workTab.locator('.tab-warning')).toBeVisible();
	await expect(page.locator('.main-content > .card')).toHaveCount(2);
	await expect(page.getByRole('link', { name: `#7 ${title}`, exact: true })).toBeVisible();
	await expect(
		page.getByText('Utilities / Custom work type / Done / Priority unavailable', {
			exact: true,
		}),
	).toBeVisible();
	await expect(page.getByText(/Synthetic upstream outage/)).toBeVisible();
	await expect(page.getByRole('link', { name: 'PR8 Synthetic review', exact: true })).toHaveCount(
		0,
	);
	await expect(page.getByRole('link', { name: 'PR9 Synthetic own PR', exact: true })).toHaveCount(
		0,
	);
	expect(await page.evaluate(() => Reflect.has(window, 'devdeskInjected'))).toBe(false);
	await expect(page.locator('img')).toHaveCount(0);
	await expect(page.locator('.sidebar input')).toHaveCount(0);
	const repoLegend = page.getByRole('region', { name: 'PR repository legend' }),
		boardLegend = page.getByRole('region', { name: 'Team board legend' }),
		workRow = page.locator('.work-row').filter({ hasText: title });
	for (const repo of [repository, secondRepository])
		await expect(repoLegend).toContainText(repo.name);
	const repoColors = await repoLegend
			.locator('.legend-dot')
			.evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).backgroundColor)),
		boardColors = await boardLegend
			.locator('.legend-dot')
			.evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot).backgroundColor));
	expect(new Set(repoColors).size).toBe(2);
	expect(new Set(boardColors).size).toBe(2);
	expect(boardColors.every((color) => !repoColors.includes(color))).toBe(true);
	const luminance = (rgb: string) => {
		const channels = rgb.match(/[\d.]+/g)?.map(Number);
		if (!channels || channels.length !== 3)
			throw new Error('Expected an opaque computed RGB color.');
		return channels.reduce((sum, value, index) => {
			const channel = value / 255,
				linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
			return sum + linear * (index === 0 ? 0.2126 : index === 1 ? 0.7152 : 0.0722);
		}, 0);
	};
	const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
		boardLuminances = boardColors.map(luminance),
		surfaces = await page
			.locator('.sidebar, section[aria-label="Azure DevOps"]')
			.evaluateAll((elements) =>
				elements.map((element) => getComputedStyle(element).backgroundColor),
			);
	expect(
		contrast(Math.max(...boardLuminances), Math.min(...boardLuminances)),
	).toBeGreaterThanOrEqual(3);
	expect(surfaces).toHaveLength(2);
	for (const surface of surfaces)
		for (const board of boardLuminances)
			expect(contrast(board, luminance(surface))).toBeGreaterThanOrEqual(3);
	expect(
		await workTab.locator('.tab-count').evaluate((element) => getComputedStyle(element).color),
	).not.toBe(
		await reviewTab
			.locator('.tab-count')
			.evaluate((element) => getComputedStyle(element).color),
	);
	for (const board of mapping.boards) {
		const selector = `[data-scope-id="${board.id}"] .legend-dot`;
		await expect(workRow.locator(selector)).toHaveCSS(
			'background-color',
			await boardLegend
				.locator(selector)
				.evaluate((element) => getComputedStyle(element).backgroundColor),
		);
	}
	await expect(workRow.locator('.work-marker > span')).toHaveCount(2);
	await expect(
		page.locator('.work-row').filter({ hasText: 'Child area work' }).locator('.scope-label'),
	).toHaveText('Utilities / Alpha board');
	await expect(
		page.locator('.work-row').filter({ hasText: 'Unmatched area work' }),
	).toContainText('No matching team board');
	await expect(page.locator('.work-row').filter({ hasText: 'Unknown area work' })).toContainText(
		'Board mapping unavailable',
	);
	const repoColor = await repoLegend
		.locator(`[data-scope-id="${repository.id}"] .legend-dot`)
		.evaluate((element) => getComputedStyle(element).backgroundColor);
	await reviewTab.click();
	await expect(reviewTab).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('link', { name: `#7 ${title}`, exact: true })).toHaveCount(0);
	const prRow = page.locator('.work-row').filter({ hasText: 'PR8 Synthetic review' });
	await expect(prRow).toBeVisible();
	await expect(prRow.locator('.legend-dot')).toHaveCSS('background-color', repoColor);
	await expect(prRow.locator('.work-marker > span')).toHaveCSS('background-color', repoColor);
	await ownTab.click();
	await expect(page.getByRole('link', { name: 'PR8 Synthetic review', exact: true })).toHaveCount(
		0,
	);
	await expect(
		page.getByRole('link', { name: 'PR9 Synthetic own PR', exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole('link', { name: 'PR13 Other repository PR', exact: true }),
	).toBeVisible();
	await workTab.click();
	await expect(page.getByRole('link', { name: `#7 ${title}`, exact: true })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'New todo' })).toBeEnabled();
	mapping.error = 'Synthetic team permission denial.';
	mapping.stale = true;
	await page.reload();
	await expect(
		page.getByText('Board mapping for Utilities: Synthetic team permission denial.'),
	).toBeVisible();
	await expect(page.locator('.work-row').filter({ hasText: title })).toContainText(
		'Board mapping stale',
	);
	await expect(workTab.locator('.tab-count')).toHaveText('4 items');
	await ownTab.click();
	await expect(
		page.getByRole('link', { name: 'PR13 Other repository PR', exact: true }),
	).toBeVisible();
});

for (const width of [375, 768, 1440]) {
	test(`UX-001/002/003: counted tabs support keyboard navigation and live cache updates at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		state.todos.items = [];
		state.ado = {
			...state.ado,
			state: 'ready',
			boardScopes: [],
			snapshots: (['work', 'reviews', 'own'] as const).map((dataset) => ({
				scope: `synthetic:${dataset}`,
				dataset,
				data: [],
				successAt: new Date().toISOString(),
				error: null,
				stale: false,
			})),
		};
		let reads = 0,
			mutations = 0;
		page.on('request', (request) => {
			if (request.method() === 'POST' && request.url().includes('/api/')) mutations++;
		});
		await page.route('**/api/state', (route) => {
			reads++;
			return route.fulfill({ json: state });
		});
		await page.goto('/');
		const workTab = page.getByRole('tab', { name: /^Assigned work items/ }),
			reviewTab = page.getByRole('tab', { name: /^Review requests/ }),
			ownTab = page.getByRole('tab', { name: /^Your pull requests/ });
		for (const tab of [workTab, reviewTab, ownTab]) {
			await expect(tab.locator('.tab-count')).toHaveText('0 items');
			await tab.click();
			await expect(tab).toBeInViewport();
			await expect(page.getByRole('tabpanel')).toContainText('No matching items');
		}
		await workTab.focus();
		await page.keyboard.press('ArrowRight');
		await expect(reviewTab).toBeFocused();
		await expect(reviewTab).toHaveAttribute('aria-selected', 'true');
		await page.keyboard.press('End');
		await expect(ownTab).toBeFocused();
		await page.keyboard.press('ArrowRight');
		await expect(workTab).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(ownTab).toBeFocused();
		await page.keyboard.press('Home');
		await expect(workTab).toBeFocused();
		await page.keyboard.press('End');
		await expect(ownTab).toHaveAttribute('aria-selected', 'true');
		await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
		await page.keyboard.press('Tab');
		await expect(page.getByRole('tabpanel')).toBeFocused();
		expect(reads).toBe(1);
		expect(mutations).toBe(0);
		const repo = state.ado.repositories[0],
			ownScope = state.ado.snapshots.find((scope) => scope.dataset === 'own');
		if (!repo || !ownScope) throw new Error('Missing synthetic tab scope');
		ownScope.data = [
			{
				id: 42,
				title: 'Synthetic tab update',
				project: repo.project,
				repositoryId: repo.id,
				repository: repo.name,
				author: 'Synthetic author',
				draft: false,
				reviewers: [],
				reason: 'Personal request',
				url: `https://dev.azure.com/vertigis/${repo.project}/_git/${repo.id}/pullrequest/42`,
			},
		];
		await page.evaluate(() => window.dispatchEvent(new Event('focus')));
		await expect(ownTab.locator('.tab-count')).toHaveText('1 item');
		await expect(ownTab).toHaveAttribute('aria-selected', 'true');
		await expect(
			page.getByRole('tabpanel').getByRole('link', { name: 'PR42 Synthetic tab update' }),
		).toBeVisible();
		expect(reads).toBe(2);
		expect(mutations).toBe(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
	});
}

test('TODO-001/UX-003/006: Enter creates once, while IME composition does not submit', async ({
	page,
	request,
}) => {
	const title = `Enter ${randomUUID()}`;
	await page.goto('/');
	const input = page.getByRole('textbox', { name: 'New todo' });
	await input.fill(title);
	await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
	await expect(page.getByRole('checkbox', { name: `Complete ${title}` })).toHaveCount(0);
	await input.press('Enter');
	await expect(page.getByRole('checkbox', { name: `Complete ${title}` })).toBeVisible();
	await expect(input).toHaveValue('');
	await expect(input).toBeFocused();
	const repeated = `${title} repeated`;
	await input.fill(repeated);
	await input.evaluate((element: HTMLInputElement) => {
		element.form?.requestSubmit();
		element.form?.requestSubmit();
	});
	await expect(
		page.getByRole('checkbox', { name: `Complete ${repeated}`, exact: true }),
	).toBeVisible();
	const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
	expect(state.todos.items.filter((todo) => todo.title === repeated)).toHaveLength(1);
});

for (const width of [375, 1440]) {
	test(`UX-003/006: chat Enter, Shift+Enter, IME and pending guards at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		state.copilot = { ...state.copilot, state: 'ready', running: false, cleanupPending: false };
		const posted: { prompt: string }[] = [];
		let finish: (() => void) | undefined;
		const pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		await page.route('**/api/state', (route) => route.fulfill({ json: state }));
		await page.route('**/api/chat', async (route) => {
			posted.push(route.request().postDataJSON());
			await pending;
			await route.fulfill({
				contentType: 'application/x-ndjson',
				body: '{"type":"complete"}\n',
			});
		});
		await page.goto('/');
		if (width < 1200) await page.getByRole('button', { name: 'Open chat' }).click();
		const input = page
			.getByRole('textbox', { name: 'Message to Copilot' })
			.filter({ visible: true });
		await input.fill('   ');
		await input.press('Enter');
		await expect(
			page.getByRole('button', { name: 'Send', exact: true }).filter({ visible: true }),
		).toBeDisabled();
		await input.fill('First line');
		await input.press('Shift+Enter');
		await input.press('End');
		await input.press('S');
		await expect(input).toHaveValue('First line\nS');
		await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
		await input.dispatchEvent('keydown', { key: 'Enter', repeat: true });
		expect(posted).toHaveLength(0);
		await input.press('Enter');
		await expect.poll(() => posted.length).toBe(1);
		await expect(input).toBeDisabled();
		await input.evaluate((element: HTMLTextAreaElement) => element.form?.requestSubmit());
		expect(posted).toEqual([{ prompt: 'First line\nS', requestId: expect.any(String) }]);
		finish?.();
		await expect(input).toBeEnabled();
		await expect(input).toHaveValue('');
		state.copilot.cleanupPending = true;
		if (width < 1200) await page.getByRole('button', { name: 'Close Copilot chat' }).click();
		await page.reload();
		if (width < 1200) await page.getByRole('button', { name: 'Open chat' }).click();
		await input.fill('Blocked during cleanup');
		await input.press('Enter');
		await expect(
			page.getByRole('button', { name: 'Send', exact: true }).filter({ visible: true }),
		).toBeDisabled();
		expect(posted).toHaveLength(1);
	});
}

for (const width of [375, 768, 1440]) {
	test(`UX-002: independent content and chat scroll containers at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		state.todos.items = Array.from({ length: 35 }, (_, index) => ({
			id: randomUUID(),
			title: `Synthetic tall todo ${index}`,
			reference: null,
			revision: 1,
			position: index,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedAt: null,
		}));
		state.chat = Array.from({ length: 40 }, (_, index) => ({
			id: randomUUID(),
			runId: randomUUID(),
			role: index % 2 ? 'assistant' : 'user',
			content: `Synthetic scroll message ${index}. `.repeat(8),
			status: 'complete',
			createdAt: new Date().toISOString(),
		}));
		await page.route('**/api/state', (route) => route.fulfill({ json: state }));
		await page.goto('/');
		const main = page.getByRole('main', { name: 'Workspace content' });
		await expect(main).toBeVisible();
		await expect(main).toHaveCSS('overflow-y', 'auto');
		const shell = await page.locator('.app-shell').boundingBox();
		expect(shell?.height).toBe(900);
		const initialChatScroll =
			width > 1200
				? await page
						.locator('.desktop-chat .messages')
						.evaluate((element) => element.scrollTop)
				: 0;
		await main.hover();
		await page.mouse.wheel(0, 500);
		await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		expect(
			await page.evaluate(() => ({
				x: window.scrollX,
				y: window.scrollY,
				height: document.documentElement.scrollHeight,
			})),
		).toEqual({ x: 0, y: 0, height: 900 });
		if (width > 1200) {
			const messages = page.locator('.desktop-chat .messages');
			expect(await messages.evaluate((element) => element.scrollTop)).toBe(initialChatScroll);
			const mainScroll = await main.evaluate((element) => element.scrollTop);
			const mainBox = await main.boundingBox(),
				chatBox = await page.locator('.desktop-chat').boundingBox();
			expect(mainBox && chatBox && mainBox.x + mainBox.width <= chatBox.x + 1).toBe(true);
			await messages.hover();
			await page.mouse.wheel(0, -350);
			await expect
				.poll(() => messages.evaluate((element) => element.scrollTop))
				.toBeLessThan(initialChatScroll);
			expect(await main.evaluate((element) => element.scrollTop)).toBe(mainScroll);
		} else {
			await page.getByRole('button', { name: 'Open chat' }).click();
			const mainScroll = await main.evaluate((element) => element.scrollTop);
			await page
				.getByRole('dialog')
				.getByRole('log')
				.evaluate((element) => {
					element.scrollTop = 0;
				});
			expect(await main.evaluate((element) => element.scrollTop)).toBe(mainScroll);
			await page.getByRole('button', { name: 'Close Copilot chat' }).click();
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
	});
}
