import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
	dashboardSchema,
	type ChatMessage,
	type ConversationSummary,
	type DashboardState,
	type HandoffDetail,
	type HandoffSummary,
	type HandoffVersion,
} from '../../src/lib/contracts';
import { handoffMarkdown, type HandoffContent } from '../../src/lib/contracts/handoffs';

const origin = new URL(process.env.DEVDESK_TEST_URL ?? 'http://127.0.0.1:3100').origin;
const headers = { 'Content-Type': 'application/json', 'X-Devdesk-Request': '1', Origin: origin };
const reference = {
	kind: 'workItem' as const,
	organization: 'vertigis',
	project: 'Utilities',
	id: 7,
};
const content: HandoffContent = {
	goal: 'Synthetic goal with <img src=x> literal text',
	description: 'Synthetic description',
	discussion: ['Agreed on option B'],
	acceptanceCriteria: ['Criterion from ticket'],
	proposedCriteria: [],
	constraints: [],
	targetRepository: null,
	assumptions: [],
	openQuestions: ['Open synthetic question'],
	limitations: [],
};

function version(
	handoffId: string,
	number: number,
	title: string,
	conversationId: string | null,
): HandoffVersion {
	const snapshot = {
		format: 1,
		version: number,
		title,
		reference,
		retrievedAt: '2026-11-03T08:00:00.000Z',
		sourceIncomplete: false,
		createdAt: `2026-11-03T0${number}:30:00.000Z`,
		content,
	};
	return {
		...snapshot,
		id: randomUUID(),
		handoffId,
		markdown: handoffMarkdown(snapshot),
		conversationId,
		originMessageId: conversationId ? randomUUID() : null,
		originRunId: null,
	};
}

function conversation(title: string, updatedAt: string): ConversationSummary {
	return { id: randomUUID(), title, createdAt: updatedAt, updatedAt, cleanupPending: false };
}

function message(role: ChatMessage['role'], text: string): ChatMessage {
	return {
		id: randomUUID(),
		runId: role === 'user' ? null : randomUUID(),
		role,
		content: text,
		status: 'complete',
		createdAt: new Date().toISOString(),
	};
}

/** Serves synthetic chat state per selected conversation, mirroring the real query contract. */
async function serveChats(
	page: Page,
	base: DashboardState,
	chats: Map<string | null, ChatMessage[]>,
) {
	await page.route(/\/api\/state(\?.*)?$/, (route) => {
		const id = new URL(route.request().url()).searchParams.get('conversation');
		const known = id && base.conversations.some((entry) => entry.id === id) ? id : null;
		return route.fulfill({
			json: { ...base, conversationId: known, chat: chats.get(known) ?? [] },
		});
	});
}

async function openChatPanel(page: Page, width: number) {
	if (width < 1200) {
		await page.getByRole('button', { name: 'Open chat' }).click();
		return page.getByRole('dialog');
	}
	return page.locator('.desktop-chat');
}

for (const width of [375, 768, 1440]) {
	test(`AI-016/019/020: chat history, exact handoff copy and unavailable references at ${width}px`, async ({
		page,
		context,
		request,
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
		await page.setViewportSize({ width, height: 900 });
		const base = dashboardSchema.parse(await (await request.get('/api/state')).json());
		const latest = conversation('Plan ticket 7', '2026-11-03T10:00:00.000Z');
		const older = conversation('Older synthetic chat', '2026-11-02T10:00:00.000Z');
		base.conversations = [latest, older];
		const saved = version(randomUUID(), 2, 'Synthetic planning handoff', latest.id);
		const chats = new Map<string | null, ChatMessage[]>([
			[
				latest.id,
				[
					message('user', 'Prepare a planning handoff for ticket 7'),
					{
						...message('tool', '{"tool":"create_planning_handoff"}'),
						handoff: {
							state: 'available',
							handoffId: saved.handoffId,
							versionId: saved.id,
							version: saved.version,
							title: saved.title,
							markdown: saved.markdown,
						},
					},
					{ ...message('tool', '{}'), handoff: { state: 'unavailable' } },
				],
			],
			[older.id, [message('user', 'Message from the older chat')]],
		]);
		await serveChats(page, base, chats);
		await page.goto('/');
		const panel = await openChatPanel(page, width);
		const card = panel.getByRole('region', {
			name: 'Planning handoff: Synthetic planning handoff',
		});
		await expect(card).toBeVisible();
		await expect(panel.getByText(/· Plan ticket 7$/)).toBeVisible();
		await expect(card.getByRole('link', { name: 'Open in Handoffs' })).toHaveAttribute(
			'href',
			`/handoffs?handoff=${saved.handoffId}&version=${saved.id}`,
		);
		await card.getByRole('button', { name: 'Copy handoff' }).click();
		await expect(card.getByRole('status')).toHaveText('Copied.');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(saved.markdown);
		await expect(panel.getByText('This planning handoff was deleted')).toBeVisible();
		await expect(panel.locator('img')).toHaveCount(0);

		await panel.getByRole('button', { name: 'History (2)' }).click();
		const history = panel.getByRole('navigation', { name: 'Chat history' });
		await expect(history.getByRole('button')).toHaveCount(2);
		await expect(history.getByRole('button', { name: /Plan ticket 7/ })).toHaveAttribute(
			'aria-current',
			'true',
		);
		await history.getByRole('button', { name: /Older synthetic chat/ }).focus();
		await page.keyboard.press('Enter');
		await expect(panel.getByText('Message from the older chat')).toBeVisible();
		await expect(card).toHaveCount(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
	});
}

test('AI-016: clipboard denial is visible and the full handoff stays selectable', async ({
	page,
	request,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new Error('Denied')) },
		});
	});
	const base = dashboardSchema.parse(await (await request.get('/api/state')).json());
	const chat = conversation('Clipboard chat', '2026-11-03T10:00:00.000Z');
	base.conversations = [chat];
	const saved = version(randomUUID(), 1, 'Denied clipboard handoff', chat.id);
	await serveChats(
		page,
		base,
		new Map([
			[
				chat.id,
				[
					{
						...message('tool', '{}'),
						handoff: {
							state: 'available',
							handoffId: saved.handoffId,
							versionId: saved.id,
							version: 1,
							title: saved.title,
							markdown: saved.markdown,
						},
					},
				],
			],
		]),
	);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/');
	const card = page.locator('.desktop-chat .handoff-card');
	await card.getByRole('button', { name: 'Copy handoff' }).click();
	await expect(card.getByRole('status')).toContainText('Copy failed');
	await card.getByText('Show full text').click();
	await expect(card.locator('pre')).toHaveText(saved.markdown);
});

test('AI-019/021: new chat omits the chat ID and deletion is bound to the confirmed chat', async ({
	page,
	request,
}) => {
	const base = dashboardSchema.parse(await (await request.get('/api/state')).json());
	base.copilot = { ...base.copilot, state: 'ready', running: false, cleanupPending: false };
	const chat = conversation('Chat to delete', '2026-11-03T10:00:00.000Z');
	base.conversations = [chat];
	await serveChats(page, base, new Map([[chat.id, [message('user', 'Existing message')]]]));
	const posted: unknown[] = [];
	await page.route('**/api/chat', async (route) => {
		posted.push(route.request().postDataJSON());
		await route.fulfill({ contentType: 'application/x-ndjson', body: '{"type":"complete"}\n' });
	});
	const removals: unknown[] = [];
	await page.route('**/api/chat/remove*', async (route) => {
		removals.push(route.request().postDataJSON());
		await route.fulfill({
			json: { ...base, conversations: [], conversationId: null, chat: [] },
		});
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/');
	const panel = page.locator('.desktop-chat');
	await expect(panel.getByText('Existing message')).toBeVisible();
	const input = panel.getByRole('textbox', { name: 'Message to Copilot' });
	await input.fill('Continue this chat');
	await input.press('Enter');
	await expect.poll(() => posted.length).toBe(1);
	expect(posted[0]).toMatchObject({ prompt: 'Continue this chat', conversationId: chat.id });
	await panel.getByRole('button', { name: 'New chat' }).click();
	await expect(panel.getByText('A little less context switching.')).toBeVisible();
	await input.fill('Fresh chat');
	await input.press('Enter');
	await expect.poll(() => posted.length).toBe(2);
	expect(posted[1]).not.toHaveProperty('conversationId');

	await panel.getByRole('button', { name: 'History (1)' }).click();
	await panel.getByRole('button', { name: /Chat to delete/ }).click();
	await panel.getByRole('button', { name: 'Delete chat' }).click();
	const dialog = page.getByRole('dialog', { name: 'Delete chat?' });
	await expect(dialog).toContainText('"Chat to delete"');
	await expect(dialog).toContainText('saved planning handoffs remain');
	await dialog.getByRole('button', { name: 'Delete chat', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	expect(removals).toEqual([{ conversationId: chat.id, confirmed: true }]);
	await expect(panel.getByText(/· New chat$/)).toBeVisible();
});

for (const width of [375, 1440]) {
	test(`AI-025/026: handoff overview, lookup, exact versions, provenance and confirmed deletion at ${width}px`, async ({
		page,
		context,
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
		await page.setViewportSize({ width, height: 900 });
		const handoffId = randomUUID();
		const conversationId = randomUUID();
		const versions = [
			version(handoffId, 1, 'First draft', null),
			version(handoffId, 2, 'Revised plan', conversationId),
		];
		const latestVersion = versions[1];
		if (!latestVersion) {
			throw new Error('Missing synthetic version');
		}
		const detail: HandoffDetail = {
			id: handoffId,
			createdAt: '2026-11-03T01:30:00.000Z',
			updatedAt: '2026-11-03T02:30:00.000Z',
			versions,
		};
		let list: HandoffSummary[] = [
			{
				id: handoffId,
				createdAt: detail.createdAt,
				updatedAt: detail.updatedAt,
				versionCount: 2,
				latest: { id: latestVersion.id, version: 2, title: 'Revised plan', reference },
			},
			{
				id: randomUUID(),
				createdAt: detail.createdAt,
				updatedAt: detail.createdAt,
				versionCount: 1,
				latest: {
					id: randomUUID(),
					version: 1,
					title: 'Other ticket plan',
					reference: { ...reference, id: 8 },
				},
			},
		];
		const deletes: unknown[] = [];
		await page.route('**/api/handoffs', (route) => route.fulfill({ json: list }));
		await page.route(`**/api/handoffs/${handoffId}`, (route) =>
			route.fulfill({ json: detail }),
		);
		await page.route('**/api/handoffs/delete', async (route) => {
			deletes.push(route.request().postDataJSON());
			list = [];
			await route.fulfill({ json: list });
		});
		await page.goto('/handoffs');
		await expect(
			page
				.getByRole('navigation', { name: 'Workspace' })
				.getByRole('link', { name: 'Handoffs' }),
		).toHaveAttribute('aria-current', 'page');
		const overview = page.getByRole('region', { name: 'Saved handoffs' });
		await expect(overview.getByRole('button')).toHaveCount(2);
		await page.getByRole('searchbox', { name: 'Search handoffs' }).fill('#8');
		await expect(overview.getByRole('button')).toHaveCount(1);
		await expect(overview.getByRole('button')).toContainText('Other ticket plan');
		await page.getByRole('searchbox', { name: 'Search handoffs' }).fill('no such plan');
		await expect(overview.getByText('No handoffs match your search.')).toBeVisible();
		await page.getByRole('searchbox', { name: 'Search handoffs' }).fill('revised');
		await overview.getByRole('button', { name: /Revised plan/ }).click();
		const panel = page.getByRole('region', { name: 'Handoff detail' });
		await expect(panel.getByRole('heading', { name: 'Revised plan' })).toBeVisible();
		await expect(panel.getByLabel('Handoff text')).toHaveText(latestVersion.markdown);
		await expect(
			panel.getByRole('link', { name: 'Open the requesting chat message' }),
		).toHaveAttribute(
			'href',
			`/?conversation=${conversationId}&message=${latestVersion.originMessageId}`,
		);
		await panel.getByRole('combobox', { name: 'Version' }).selectOption({ index: 0 });
		await expect(panel.getByRole('heading', { name: 'First draft' })).toBeVisible();
		await expect(panel.getByText('The source chat was deleted')).toBeVisible();
		await panel.getByRole('button', { name: 'Copy handoff' }).click();
		await expect(panel.getByRole('status')).toHaveText('Copied.');
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			versions[0]?.markdown,
		);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

		await panel.getByRole('button', { name: 'Delete handoff' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete handoff?' });
		await expect(dialog).toContainText('all 2 saved versions');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		expect(deletes).toEqual([]);
		await panel.getByRole('button', { name: 'Delete handoff' }).click();
		await dialog.getByRole('button', { name: 'Delete handoff', exact: true }).click();
		await expect(dialog).toHaveCount(0);
		expect(deletes).toEqual([{ handoffId, latestVersion: 2, confirmed: true }]);
		await expect(page.getByText('No saved handoffs yet.')).toBeVisible();
	});
}

test('AI-025: overview failures are distinct from an empty result and can be retried', async ({
	page,
}) => {
	let fail = true;
	await page.route('**/api/handoffs', (route) =>
		fail
			? route.fulfill({ status: 503, json: { error: 'Storage unavailable.', code: 'X' } })
			: route.fulfill({ json: [] }),
	);
	await page.goto(`/handoffs?handoff=${randomUUID()}`);
	await expect(page.getByRole('alert').filter({ hasText: 'Storage unavailable.' })).toBeVisible();
	await expect(page.getByText('No saved handoffs yet.')).toHaveCount(0);
	await expect(page.getByText('This handoff is no longer available.')).toBeVisible();
	fail = false;
	await page.getByRole('button', { name: 'Retry' }).click();
	await expect(page.getByText('No saved handoffs yet.')).toBeVisible();
});

test('AI-020/021/025/026: real API validates chat and handoff identities without side effects', async ({
	request,
}) => {
	const unknown = randomUUID();
	expect(await (await request.get('/api/handoffs')).json()).toEqual(expect.any(Array));
	expect((await request.get(`/api/handoffs/${unknown}`)).status()).toBe(404);
	expect((await request.get('/api/handoffs/not-a-uuid')).status()).toBe(400);
	const state = dashboardSchema.parse(
		await (await request.get(`/api/state?conversation=${unknown}`)).json(),
	);
	expect(state.conversationId).toBeNull();
	expect(state.chat).toEqual([]);
	expect((await request.get('/api/state?conversation=invalid')).status()).toBe(400);
	expect(
		(
			await request.post('/api/chat/remove', {
				headers,
				data: { conversationId: unknown, confirmed: true },
			})
		).status(),
	).toBe(404);
	expect(
		(
			await request.post('/api/chat/remove', { headers, data: { conversationId: unknown } })
		).status(),
	).toBe(400);
	expect(
		(
			await request.post('/api/handoffs/delete', {
				headers,
				data: { handoffId: unknown, latestVersion: 1, confirmed: true },
			})
		).status(),
	).toBe(404);
	expect(
		(
			await request.post('/api/handoffs/delete', {
				headers: { ...headers, Origin: 'https://evil.test' },
				data: { handoffId: unknown, latestVersion: 1, confirmed: true },
			})
		).status(),
	).toBe(403);
	expect(
		(
			await request.post('/api/chat', {
				headers,
				data: { prompt: 'Hello', requestId: randomUUID(), conversationId: unknown },
			})
		).status(),
	).toBe(503);
});
