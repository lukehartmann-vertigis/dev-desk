import { expect, test } from '@playwright/test';
import {
	dashboardSchema,
	settingsResponseSchema,
	type Source,
	type SourceSettings,
} from '../../src/lib/contracts';

const firstProject = '11111111-1111-4111-8111-111111111111';
const secondProject = '22222222-2222-4222-8222-222222222222';
const board: Source = {
	id: '33333333-3333-4333-8333-333333333333',
	projectId: firstProject,
	project: 'Project A',
	name: 'Readable team',
};
const otherBoard: Source = {
	...board,
	id: '44444444-4444-4444-8444-444444444444',
	name: 'Other team',
};
const repository: Source = {
	id: '55555555-5555-4555-8555-555555555555',
	projectId: secondProject,
	project: 'Project B',
	name: 'Repository',
};
const empty: SourceSettings = {
	organization: 'example',
	revision: 0,
	boards: [],
	repositories: [],
};
const connection = { state: 'ready', message: 'Synthetic connection.' };

for (const width of [375, 768, 1440]) {
	test(`SET-001: shared navigation stays available across Overview and Settings at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/');
		const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true });
		const overview = navigation.getByRole('link', { name: 'Overview', exact: true });
		const settings = navigation.getByRole('link', { name: 'Settings', exact: true });
		await expect(overview).toBeVisible();
		await expect(overview).toHaveAttribute('aria-current', 'page');
		await settings.click();
		await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
		await expect(navigation).toBeVisible();
		await expect(settings).toHaveAttribute('aria-current', 'page');
		await expect(overview).not.toHaveAttribute('aria-current', 'page');
		await expect(page.getByRole('searchbox', { name: 'Search Repositories' })).toBeVisible();
		const main = page.getByRole('main', { name: 'Settings content', exact: true });
		const columns = await page
			.locator('.app-shell')
			.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
		expect(columns).toBe(width <= 700 ? 1 : 2);
		const position = await navigation.boundingBox();
		await main.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		expect(await navigation.boundingBox()).toEqual(position);
		expect(
			await page.evaluate(() => ({
				overflow: document.documentElement.scrollWidth > window.innerWidth,
				height: document.documentElement.scrollHeight,
			})),
		).toEqual({ overflow: false, height: 900 });
		await overview.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('textbox', { name: 'New todo' })).toBeVisible();
		await expect(overview).toHaveAttribute('aria-current', 'page');
		await expect(settings).not.toHaveAttribute('aria-current', 'page');
		await page.goto('/settings');
		await expect(settings).toHaveAttribute('aria-current', 'page');
		await expect(overview).toBeVisible();
		await page.reload();
		await expect(settings).toHaveAttribute('aria-current', 'page');
	});
}

test('SET-001: workspace loading failure does not remove navigation to Settings', async ({
	page,
}) => {
	await page.route('**/api/state', (route) =>
		route.fulfill({
			status: 503,
			json: { error: 'Synthetic workspace unavailable.', code: 'UNAVAILABLE' },
		}),
	);
	await page.goto('/');
	await expect(
		page.getByRole('alert').filter({ hasText: 'Synthetic workspace unavailable.' }),
	).toBeVisible();
	const navigation = page.getByRole('navigation', { name: 'Workspace', exact: true });
	await expect(navigation.getByRole('link', { name: 'Overview' })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
	await expect(navigation.getByRole('link', { name: 'Overview' })).toBeVisible();
});

test('SET-001/003: select cross-project sources, search, cancel, save, and reload', async ({
	page,
}) => {
	let saved = { ...empty };
	let saves = 0;
	await page.route('**/api/settings', async (route) => {
		if (route.request().method() === 'POST') {
			const command = route.request().postDataJSON();
			expect(command.boards).toEqual([{ id: board.id, projectId: firstProject }]);
			expect(command.repositories).toEqual([{ id: repository.id, projectId: secondProject }]);
			saved = {
				...saved,
				revision: saved.revision + 1,
				boards: [board],
				repositories: [repository],
			};
			saves++;
		}
		await route.fulfill({ json: { settings: saved, connection, warnings: [] } });
	});
	await page.route('**/api/settings/catalog', (route) =>
		route.fulfill({
			json: { boards: [board, otherBoard], repositories: [repository], errors: [] },
		}),
	);
	await page.goto('/settings');
	const team = page.getByRole('checkbox', { name: 'Project A / Readable team' });
	await expect(team).toBeVisible();
	await team.focus();
	await page.keyboard.press('Space');
	await expect(team).toBeChecked();
	await page.getByRole('searchbox', { name: 'Search Work Item Sources' }).fill('does not match');
	await expect(team).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Project A / Other team' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.getByRole('searchbox', { name: 'Search Work Item Sources' }).fill('');
	await expect(team).not.toBeChecked();
	await team.check();
	await page.getByRole('checkbox', { name: 'Project B / Repository' }).check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Sources saved.');
	expect(saves).toBe(1);
	await page.reload();
	await expect(team).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Project B / Repository' })).toBeChecked();
	await expect(page.getByRole('combobox')).toHaveCount(0);
	for (const width of [375, 768, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
		).toBe(true);
		await expect(page.getByRole('link', { name: 'Back to workspace' })).toBeVisible();
	}
});

test('SET-003: a save conflict retains the draft and reports no success', async ({ page }) => {
	await page.route('**/api/settings', (route) =>
		route.request().method() === 'POST'
			? route.fulfill({
					status: 409,
					json: { code: 'CONFLICT', error: 'Settings changed in another tab.' },
				})
			: route.fulfill({ json: { settings: empty, connection, warnings: [] } }),
	);
	await page.route('**/api/settings/catalog', (route) =>
		route.fulfill({ json: { boards: [board], repositories: [], errors: [] } }),
	);
	await page.goto('/settings');
	const team = page.getByRole('checkbox', { name: 'Project A / Readable team' });
	await team.check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('alert').filter({ hasText: 'another tab' })).toBeVisible();
	await expect(team).toBeChecked();
	await expect(page.getByText('Sources saved.', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(team).not.toBeChecked();
});

test('SET-009: incomplete discovery keeps unavailable selected sources visible and removable', async ({
	page,
}) => {
	let saved = { ...empty, revision: 1, boards: [board] };
	await page.route('**/api/settings', async (route) => {
		if (route.request().method() === 'POST') {
			expect(route.request().postDataJSON().boards).toEqual([]);
			saved = { ...saved, revision: saved.revision + 1, boards: [] };
		}
		await route.fulfill({ json: { settings: saved, connection, warnings: [] } });
	});
	await page.route('**/api/settings/catalog', (route) =>
		route.fulfill({
			json: { boards: [], repositories: [], errors: ['Project A teams: Access denied.'] },
		}),
	);
	await page.goto('/settings');
	const team = page.getByRole('checkbox', { name: 'Project A / Readable team' });
	await expect(team).toBeChecked();
	await expect(page.getByRole('alert').filter({ hasText: 'Access denied' })).toBeVisible();
	await expect(
		page.getByText('Unavailable in the current discovery; saved selection retained.'),
	).toBeVisible();
	await team.uncheck();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Sources saved.');
});

test('SET-003/004/010: the real settings API persists empty scope and rejects cross-origin changes', async ({
	request,
	page,
}) => {
	const read = await request.get('/api/settings');
	expect(read.ok()).toBe(true);
	const current = settingsResponseSchema.parse(await read.json());
	const before = dashboardSchema.parse(await (await request.get('/api/state')).json());
	const command = { revision: current.settings.revision, boards: [], repositories: [] };
	const origin = new URL(process.env.DEVDESK_TEST_URL ?? 'http://127.0.0.1:3000').origin;
	const headers = {
		Origin: origin,
		'Content-Type': 'application/json',
		'X-Devdesk-Request': '1',
	};
	expect(
		(
			await request.post('/api/settings', {
				headers: { ...headers, Origin: 'https://untrusted.example' },
				data: command,
			})
		).status(),
	).toBe(403);
	const response = await request.post('/api/settings', { headers, data: command });
	expect(response.ok()).toBe(true);
	const saved = settingsResponseSchema.parse(await response.json());
	expect(saved.settings.revision).toBe(current.settings.revision + 1);
	const after = dashboardSchema.parse(await (await request.get('/api/state')).json());
	expect(after.todos).toEqual(before.todos);
	expect(after.chat).toEqual(before.chat);
	expect((await request.post('/api/settings', { headers, data: command })).status()).toBe(409);
	await page.goto('/');
	await expect(page.getByRole('link', { name: 'Choose sources in Settings' })).toBeVisible();
	await page.getByRole('link', { name: 'Settings', exact: true }).last().click();
	await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
