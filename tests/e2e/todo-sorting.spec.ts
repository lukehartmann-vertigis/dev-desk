import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { dashboardSchema } from '../../src/lib/contracts';

const headers = {
	'Content-Type': 'application/json',
	'X-Devdesk-Request': '1',
	Origin: new URL(process.env.DEVDESK_TEST_URL ?? 'http://127.0.0.1:3000').origin,
};

async function createTodos(request: APIRequestContext) {
	const prefix = `Sorting ${randomUUID()}`;
	for (const suffix of ['first', 'second']) {
		const response = await request.post('/api/todos', {
			headers,
			data: { kind: 'create', requestId: randomUUID(), title: `${prefix} ${suffix}` },
		});
		expect(response.ok()).toBe(true);
	}
	return prefix;
}

for (const width of [375, 1440]) {
	test(`TODO-008/UX-002: compact borderless handles and vertical-only dragging at ${width}px`, async ({
		page,
		request,
	}) => {
		const prefix = await createTodos(request);
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/');
		const source = page.getByRole('button', { name: `Reorder ${prefix} first`, exact: true });
		const target = page.getByRole('button', { name: `Reorder ${prefix} second`, exact: true });
		const row = page.locator('.todo-row').filter({ hasText: `${prefix} first` });
		await source.scrollIntoViewIfNeeded();
		await target.scrollIntoViewIfNeeded();
		await expect(source).toHaveCSS('width', '33px');
		await expect(source).toHaveCSS('height', '33px');
		await expect(source).toHaveCSS('border-top-width', '0px');
		await expect(source).toHaveCSS('border-right-width', '0px');
		await expect(source.locator('svg')).toHaveAttribute('width', '12');
		await expect(source.locator('svg')).toHaveAttribute('height', '18');
		await source.hover();
		await expect(source).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
		const from = await source.boundingBox();
		const to = await target.boundingBox();
		const initialRow = await row.boundingBox();
		if (!from || !to || !initialRow) {
			throw new Error('Missing vertical drag coordinates.');
		}
		const count = await page.getByRole('button', { name: /^Reorder / }).count();
		const x = from.x + from.width / 2;
		const y = from.y + from.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 12, y + 10);
		await expect(source).toHaveAttribute('aria-pressed', 'true');
		await page.mouse.move(x + 72, to.y + to.height / 2, { steps: 10 });
		await expect(page.getByRole('status')).toHaveText(`Over position ${count} of ${count}.`);
		await expect
			.poll(() =>
				row.evaluate(
					(element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
				),
			)
			.toBeGreaterThan(0);
		const movement = await row.evaluate((element) => ({
			x: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
			left: element.getBoundingClientRect().left,
		}));
		expect(movement.x).toBe(0);
		expect(movement.left).toBeCloseTo(initialRow.x, 4);
		await page.mouse.up();
		await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
			`${prefix} second`,
		);
		await page.reload();
		await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
			`${prefix} second`,
		);
	});
}

test('TODO-008/UX-003: handle keyboard sorting persists and Escape cancels without writes', async ({
	page,
	request,
}) => {
	const prefix = await createTodos(request);
	const writes: unknown[] = [];
	page.on('request', (request) => {
		if (request.url().endsWith('/api/todos') && request.method() === 'POST') {
			writes.push(request.postDataJSON());
		}
	});
	await page.goto('/');
	const handle = page.getByRole('button', { name: `Reorder ${prefix} second`, exact: true });
	await expect(handle).toBeVisible();
	const count = await page.getByRole('button', { name: /^Reorder / }).count();
	await handle.focus();
	await handle.press('Space');
	await expect(handle).toHaveAttribute('aria-pressed', 'true');
	await handle.press('ArrowUp');
	await expect(page.getByRole('status')).toHaveText(`Over position ${count - 1} of ${count}.`);
	await handle.press('Escape');
	expect(writes).toEqual([]);
	await expect(handle).toBeFocused();
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} first`,
	);
	await handle.press('Space');
	await expect(handle).toHaveAttribute('aria-pressed', 'true');
	await handle.press('ArrowUp');
	await expect(page.getByRole('status')).toHaveText(`Over position ${count - 1} of ${count}.`);
	await handle.press('Space');
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} second`,
	);
	expect(writes).toHaveLength(1);
	await page.reload();
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} second`,
	);
});

test('TODO-008/UX-002: touch handle sorting persists on a narrow screen', async ({
	page,
	request,
}) => {
	const prefix = await createTodos(request);
	await page.setViewportSize({ width: 375, height: 900 });
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const touch = await page.context().newCDPSession(page);
	await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
	await page.goto('/');
	const source = page.getByRole('button', { name: `Reorder ${prefix} first`, exact: true });
	const target = page.getByRole('button', { name: `Reorder ${prefix} second`, exact: true });
	await source.scrollIntoViewIfNeeded();
	await target.scrollIntoViewIfNeeded();
	const from = await source.boundingBox();
	const to = await target.boundingBox();
	if (!from || !to) {
		throw new Error('Missing touch drag handle coordinates.');
	}
	const x = from.x + from.width / 2;
	const y = from.y + from.height / 2;
	await expect(source).toHaveCSS('touch-action', 'none');
	await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
	await touch.send('Input.dispatchTouchEvent', {
		type: 'touchMove',
		touchPoints: [{ x, y: y + 10 }],
	});
	await expect(page.locator('.todo-row[data-dragging="true"]')).toContainText(`${prefix} first`);
	for (let step = 1; step <= 10; step++) {
		await touch.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{
					x: x + (72 * step) / 10,
					y: y + 10 + ((to.y + to.height / 2 - y - 10) * step) / 10,
				},
			],
		});
	}
	const horizontalMovement = await page
		.locator('.todo-row[data-dragging="true"]')
		.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41);
	expect(horizontalMovement).toBe(0);
	await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} second`,
	);
	await page.reload();
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} second`,
	);
	await touch.detach();
});

test('TODO-008/UX-006: pending sorting locks controls, conflicts preserve order and retry succeeds', async ({
	page,
	request,
}) => {
	const prefix = await createTodos(request);
	const pending = Promise.withResolvers<void>();
	const writes: unknown[] = [];
	await page.route('**/api/todos', async (route) => {
		writes.push(route.request().postDataJSON());
		await pending.promise;
		await route.fulfill({
			status: 409,
			json: { code: 'CONFLICT', error: 'Synthetic ordering conflict.' },
		});
	});
	await page.goto('/');
	const handle = page.getByRole('button', { name: `Reorder ${prefix} second`, exact: true });
	await expect(handle).toBeVisible();
	const count = await page.getByRole('button', { name: /^Reorder / }).count();
	await handle.focus();
	await handle.press('Space');
	await expect(handle).toHaveAttribute('aria-pressed', 'true');
	await handle.press('ArrowUp');
	await expect(page.getByRole('status')).toHaveText(`Over position ${count - 1} of ${count}.`);
	await handle.press('Space');
	await expect.poll(() => writes.length).toBe(1);
	await expect(handle).toBeDisabled();
	await expect(
		page.getByRole('button', { name: `Move ${prefix} second up`, exact: true }),
	).toBeDisabled();
	pending.resolve();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Synthetic ordering conflict.' }),
	).toBeVisible();
	await expect(handle).toBeEnabled();
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} first`,
	);
	expect(writes).toHaveLength(1);
	await page.unroute('**/api/todos');
	await handle.focus();
	await handle.press('Space');
	await expect(handle).toHaveAttribute('aria-pressed', 'true');
	await handle.press('ArrowUp');
	await expect(page.getByRole('status')).toHaveText(`Over position ${count - 1} of ${count}.`);
	await handle.press('Space');
	await expect(page.locator('.todo-row').filter({ hasText: prefix }).first()).toContainText(
		`${prefix} second`,
	);
	const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
	expect(
		state.todos.items.filter((todo) => todo.title.startsWith(prefix)).map((todo) => todo.title),
	).toEqual([`${prefix} second`, `${prefix} first`]);
});
