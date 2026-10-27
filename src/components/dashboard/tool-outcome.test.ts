import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../lib/contracts';
import { ToolOutcome } from './tool-outcome';

function render(content: string, status = 'complete') {
	const message: ChatMessage = {
		id: 'message',
		runId: 'run',
		role: 'tool',
		content,
		status,
		createdAt: '2026-01-01T00:00:00Z',
	};
	return renderToStaticMarkup(createElement(ToolOutcome, { message }));
}

describe('compact tool outcomes', () => {
	it('summarizes successful reads without claiming a write was committed', () => {
		const html = render(
			JSON.stringify({ tool: 'list_todos', outcome: { ok: true, result: [] } }),
		);
		expect(html).toContain('Read todos');
		expect(html).toContain('Completed');
		expect(html).not.toContain('data-failed');
		expect(html).not.toContain('committed');
		expect(html).toContain('<time dateTime="2026-01-01T00:00:00Z">');
	});

	it('exposes an unsuccessful outcome even when the durable message status is complete', () => {
		const html = render(
			JSON.stringify({
				tool: 'read_azure_detail',
				outcome: { ok: false, code: 'TIMEOUT', error: 'Timed out.' },
			}),
		);
		expect(html).toContain('Read Azure DevOps details');
		expect(html).toContain('Failed');
		expect(html).toContain('data-failed="true"');
		expect(html).toContain('Timed out.');
		expect(html).not.toContain('Completed');
	});

	it('identifies pending deletion approval rather than implying completed deletion', () => {
		const html = render(
			JSON.stringify({
				tool: 'request_todo_deletion',
				outcome: { ok: true, result: { status: 'awaiting_ui_confirmation' } },
			}),
		);
		expect(html).toContain('Request todo deletion');
		expect(html).toContain('Awaiting approval');
		expect(html).not.toContain('Completed');
	});

	it.each(['not JSON', '{"result":"legacy text"}', '{"tool":"read","outcome":{}}'])(
		'keeps unstructured content readable and explicitly unidentified: %s',
		(content) => {
			const html = render(content);
			expect(html).toContain('Tool outcome');
			expect(html).toContain('Unstructured output');
			expect(html).not.toContain('Completed');
			expect(html).toContain('<pre>');
		},
	);

	it('preserves unknown tool names and escapes literal HTML in names and payloads', () => {
		const html = render(
			JSON.stringify({
				tool: '<img src=x>',
				outcome: { ok: true, result: '**literal** <script>bad()</script>' },
			}),
		);
		expect(html).toContain('&lt;img src=x&gt;');
		expect(html).toContain('**literal** &lt;script&gt;bad()&lt;/script&gt;');
		expect(html).not.toContain('<img');
		expect(html).not.toContain('<script>');
	});

	it.each(['__proto__', 'toString'])('treats %s as a literal unknown tool name', (tool) => {
		const html = render(JSON.stringify({ tool, outcome: { ok: true } }));
		expect(html).toContain(tool);
		expect(html).toContain('Completed');
	});

	it('preserves an explicit interrupted or failed transcript state', () => {
		expect(
			render(JSON.stringify({ tool: 'mutate_todo', outcome: { ok: true } }), 'interrupted'),
		).toContain('interrupted');
		const failed = render('plain failure', 'failed');
		expect(failed).toContain('failed');
		expect(failed).toContain('data-failed="true"');
	});
});
