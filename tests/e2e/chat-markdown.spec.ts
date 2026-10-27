import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { dashboardSchema, type ChatMessage } from '../../src/lib/contracts';

for (const width of [375, 1440]) {
	test(`UX-005: safe assistant GFM and literal user/tool text at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		const allowed = 'https://dev.azure.com/vertigis/Utilities/_workitems/edit/7';
		state.todos.items.push({
			id: randomUUID(),
			title: 'Synthetic source',
			revision: 1,
			position: 10000,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			completedAt: null,
			reference: { kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 7 },
		});
		const content = [
			'## Plan',
			'**Important** and *emphasis* with `inline()`.',
			'- First item\n- Second item',
			'1. Ordered item\n2. Next item',
			'- [x] Completed task\n- [ ] Pending task',
			'> Quoted context',
			'```ts\nconst done = true;\n' + 'x'.repeat(350) + '\n```',
			'| Source | Status |\n| --- | --- |\n| Work item | Ready |',
			`[Known source](${allowed}) and ${allowed}`,
			'[Unknown](https://tracking.invalid/page) [Bad](javascript:alert%281%29)',
			'[Outside scope](https://dev.azure.com/other/Project/_workitems/edit/8)',
			'![Image description](https://tracking.invalid/image.png)',
			'<img src="https://tracking.invalid/html.png" onerror="window.digestInjected=true">',
			'<script>window.digestInjected=true</script>',
			'<iframe src="https://tracking.invalid/frame"></iframe>',
		].join('\n\n');
		const messages: Pick<ChatMessage, 'role' | 'content'>[] = [
			{ role: 'assistant', content },
			{ role: 'user', content: '**Literal user text** <img src=x>' },
			{ role: 'tool', content: '{"result":"**Literal tool text**"}' },
		];
		state.chat = messages.map((message) => ({
			...message,
			id: randomUUID(),
			runId: randomUUID(),
			status: 'complete',
			createdAt: new Date().toISOString(),
		}));
		const externalRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().startsWith('https://tracking.invalid')) {
				externalRequests.push(request.url());
			}
		});
		await page.route('https://tracking.invalid/**', (route) => route.abort());
		await page.route('**/api/state', (route) => route.fulfill({ json: state }));
		await page.goto('/');
		if (width < 1200) {
			await page.getByRole('button', { name: 'Open chat' }).click();
		}
		const log = page.getByRole('log', { name: 'Conversation' });
		const assistant = log.locator('.bubble.assistant');
		await expect(assistant.getByRole('heading', { name: 'Plan', level: 2 })).toBeVisible();
		await expect(assistant.locator('strong')).toHaveText('Important');
		await expect(assistant.locator('em')).toHaveText('emphasis');
		await expect(assistant.locator('ol > li')).toHaveCount(2);
		await expect(assistant.getByRole('checkbox')).toHaveCount(2);
		await expect(assistant.getByRole('checkbox').first()).toBeDisabled();
		await expect(assistant.getByRole('checkbox').first()).toBeChecked();
		await expect(assistant.locator('blockquote')).toHaveText('Quoted context');
		await expect(assistant.locator('pre code.language-ts')).toContainText('const done = true;');
		await expect(assistant.getByRole('cell', { name: 'Ready', exact: true })).toBeVisible();
		await expect(assistant.getByRole('link')).toHaveCount(2);
		await expect(assistant.getByRole('link', { name: 'Known source' })).toHaveAttribute(
			'href',
			allowed,
		);
		await expect(assistant.getByRole('link', { name: 'Known source' })).toHaveAttribute(
			'rel',
			'noopener noreferrer',
		);
		await expect(log.locator('img, iframe, script')).toHaveCount(0);
		await expect(assistant).toContainText('Image description');
		await expect(log.locator('.bubble.user')).toContainText(
			'**Literal user text** <img src=x>',
		);
		await expect(log.locator('.bubble.user strong')).toHaveCount(0);
		await log.locator('.tool-outcome summary').click();
		await expect(log.locator('.tool-outcome pre')).toHaveText(
			'{"result":"**Literal tool text**"}',
		);
		expect(externalRequests).toEqual([]);
		expect(await page.evaluate(() => Reflect.has(window, 'digestInjected'))).toBe(false);
		const geometry = await page.evaluate(() => ({
			width: document.documentElement.scrollWidth,
			height: document.documentElement.scrollHeight,
		}));
		expect(geometry).toEqual({ width, height: 900 });
		await expect(assistant.locator('pre')).toHaveCSS('overflow-x', 'auto');
	});
}

for (const width of [375, 1440]) {
	test(`UX-005: tool results stay one line, disclose safely and show failures at ${width}px`, async ({
		page,
		request,
	}) => {
		await page.setViewportSize({ width, height: 900 });
		const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
		const contents = [
			JSON.stringify({ tool: 'list_todos', outcome: { ok: true, result: [] } }),
			JSON.stringify({
				tool: 'read_azure_detail',
				outcome: {
					ok: false,
					code: 'TIMEOUT',
					error: '<img src=x> **literal** ' + 'x'.repeat(3000),
				},
			}),
			JSON.stringify({
				tool: 'request_todo_deletion',
				outcome: { ok: true, result: { status: 'awaiting_ui_confirmation' } },
			}),
			'Legacy output **literal** <img src=x>',
		];
		state.chat = contents.map((content) => ({
			id: randomUUID(),
			runId: randomUUID(),
			role: 'tool',
			content,
			status: 'complete',
			createdAt: new Date().toISOString(),
		}));
		await page.route('**/api/state', (route) => route.fulfill({ json: state }));
		await page.goto('/');
		if (width < 1200) {
			await page.getByRole('button', { name: 'Open chat' }).click();
		}
		const log = page.getByRole('log', { name: 'Conversation' });
		const outcomes = log.locator('.tool-outcome');
		await expect(outcomes).toHaveCount(4);
		const geometry = await outcomes.evaluateAll((elements) =>
			elements.map((element) => ({
				height: element.getBoundingClientRect().height,
				open: element.hasAttribute('open'),
			})),
		);
		expect(geometry.every((result) => result.height === 32 && !result.open)).toBe(true);
		await expect(outcomes.nth(0).locator('summary')).toContainText('Read todosCompleted');
		await expect(outcomes.nth(1).locator('summary')).toContainText(
			'Read Azure DevOps detailsFailed',
		);
		await expect(outcomes.nth(1)).toHaveAttribute('data-failed', 'true');
		await expect(outcomes.nth(2).locator('summary')).toContainText(
			'Request todo deletionAwaiting approval',
		);
		await expect(outcomes.nth(3).locator('summary')).toContainText(
			'Tool outcomeUnstructured output',
		);
		await expect(outcomes.nth(1).locator('pre')).toBeHidden();
		await expect(outcomes.nth(1).locator('time')).toBeHidden();
		await outcomes.nth(1).locator('summary').focus();
		await page.keyboard.press('Enter');
		await expect(outcomes.nth(1)).toHaveAttribute('open', '');
		await expect(outcomes.nth(1).locator('pre')).toHaveText(contents[1]!);
		await expect(outcomes.nth(1).locator('time')).toBeVisible();
		await expect(log.locator('img, script, strong')).toHaveCount(0);
		expect(
			await outcomes
				.nth(1)
				.locator('pre')
				.evaluate((element) => element.scrollWidth <= element.clientWidth),
		).toBe(true);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
		await page.keyboard.press('Space');
		await expect(outcomes.nth(1)).not.toHaveAttribute('open');
	});
}

test('UX-005: partial streamed Markdown completes and renders again after reload', async ({
	page,
	request,
}) => {
	const state = dashboardSchema.parse(await (await request.get('/api/state')).json());
	state.copilot = { ...state.copilot, state: 'ready', running: false, cleanupPending: false };
	const message = {
		id: randomUUID(),
		runId: randomUUID(),
		role: 'assistant' as const,
		content: 'Thinking...',
		status: 'running',
		createdAt: new Date().toISOString(),
	};
	state.chat = [message];
	await page.route('**/api/state', (route) => route.fulfill({ json: state }));
	await page.addInitScript(() => {
		const original = window.fetch;
		window.fetch = (input, init) => {
			if (input === '/api/chat') {
				return Promise.resolve(
					new Response(
						new ReadableStream({
							start(controller) {
								Reflect.set(window, 'digestTestStream', (value: string | null) => {
									if (value === null) {
										controller.close();
									} else {
										controller.enqueue(new TextEncoder().encode(value));
									}
								});
							},
						}),
						{ headers: { 'Content-Type': 'application/x-ndjson' } },
					),
				);
			}
			return original(input, init);
		};
	});
	await page.goto('/');
	await page
		.getByRole('textbox', { name: 'Message to Copilot' })
		.fill('Synthetic streaming request');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	const send = async (value: unknown) =>
		page.evaluate(
			(chunk: string | null) => {
				const dispatch: unknown = Reflect.get(window, 'digestTestStream');
				if (typeof dispatch !== 'function') {
					throw new Error('Missing synthetic chat stream.');
				}
				dispatch(chunk);
			},
			value === null ? null : `${JSON.stringify(value)}\n`,
		);
	const assistant = page.getByRole('log', { name: 'Conversation' }).locator('.bubble.assistant');
	await send({ type: 'text', text: '## Live\n\n**partial' });
	await expect(assistant.getByRole('heading', { name: 'Live' })).toBeVisible();
	await expect(assistant).toContainText('**partial');
	message.content = '## Live\n\n**Complete**\n\n```ts\nconst done = true;\n```';
	message.status = 'complete';
	await send({ type: 'text', text: message.content });
	await expect(assistant.locator('strong')).toHaveText('Complete');
	await expect(assistant.locator('pre code')).toHaveText('const done = true;\n');
	await send({ type: 'complete' });
	await send(null);
	await expect(page.getByRole('textbox', { name: 'Message to Copilot' })).toBeEnabled();
	await page.reload();
	await expect(assistant.locator('strong')).toHaveText('Complete');
	await expect(assistant.locator('pre code')).toHaveText('const done = true;\n');
});
