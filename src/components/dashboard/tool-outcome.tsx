'use client';

import { z } from 'zod';
import type { ChatMessage } from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';

const envelopeSchema = z.object({
	tool: z.string().min(1),
	outcome: z.object({ ok: z.boolean(), result: z.unknown().optional() }),
});
const approvalSchema = z.object({ status: z.literal('awaiting_ui_confirmation') });
const toolLabels = new Map([
	['list_todos', 'Read todos'],
	['read_dashboard', 'Read cached Azure DevOps'],
	['read_azure_detail', 'Read Azure DevOps details'],
	['mutate_todo', 'Update todo'],
	['request_todo_deletion', 'Request todo deletion'],
]);

function summary(message: ChatMessage) {
	const raw = {
		label: 'Tool outcome',
		status: message.status === 'complete' ? 'Unstructured output' : message.status,
		failed: message.status === 'failed',
	};
	let value: unknown;
	try {
		value = JSON.parse(message.content);
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return raw;
	}
	const parsed = envelopeSchema.safeParse(value);
	if (!parsed.success) {
		return raw;
	}
	const { tool, outcome } = parsed.data;
	const failed = !outcome.ok || message.status === 'failed';
	let status = message.status;
	if (failed) {
		status = 'Failed';
	} else if (approvalSchema.safeParse(outcome.result).success) {
		status = 'Awaiting approval';
	} else if (status === 'complete') {
		status = 'Completed';
	}
	return { label: toolLabels.get(tool) ?? tool, status, failed };
}

/**
 * Compact native disclosure for a durable tool result, with failure/approval state visible when closed.
 * Preserves all literal content and timestamps; legacy/unstructured content is explicitly labelled raw.
 */
export function ToolOutcome({ message }: { message: ChatMessage }) {
	const result = summary(message);
	return (
		<details className="tool-outcome" data-failed={result.failed || undefined}>
			<summary>
				<svg
					className="tool-chevron"
					width="12"
					height="12"
					viewBox="0 0 12 12"
					fill="none"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path d="m4 2 4 4-4 4" />
				</svg>
				<span className="tool-outcome-name" title={result.label}>
					{result.label}
				</span>
				<span className="tool-outcome-status">{result.status}</span>
			</summary>
			<div className="tool-outcome-content">
				<time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
				<pre>{message.content}</pre>
			</div>
		</details>
	);
}
