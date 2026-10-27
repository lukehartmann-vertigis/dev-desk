import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from './chat';
import { chatResponse } from './chat-response';
import { AppError } from './errors';

const command = { prompt: 'Read my todos.', requestId: '00000000-0000-4000-8000-000000000001' };
const decoder = new TextDecoder();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function openResponse(signal = new AbortController().signal) {
	const completion = Promise.withResolvers<void>();
	const start = vi.fn<Chat['start']>(() => completion.promise);
	const response = chatResponse({ start }, command, signal);
	const call = start.mock.calls[0];
	const reader = response.body?.getReader();
	if (!call || !reader) {
		throw new Error('Expected a started run and readable chat response.');
	}
	return { completion, response, reader, call };
}

describe('chat NDJSON transport', () => {
	it('streams start, heartbeat, text and completion without caching or buffering', async () => {
		const { completion, response, reader, call } = openResponse();
		expect(call.slice(0, 2)).toEqual([command.prompt, command.requestId]);
		expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('X-Accel-Buffering')).toBe('no');
		expect(decoder.decode((await reader.read()).value)).toBe('{"type":"started"}\n');
		await vi.advanceTimersByTimeAsync(4999);
		let heartbeatReceived = false;
		const heartbeat = reader.read().then((chunk) => {
			heartbeatReceived = true;
			return chunk;
		});
		await Promise.resolve();
		expect(heartbeatReceived).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(decoder.decode((await heartbeat).value)).toBe('{"type":"heartbeat"}\n');
		call[3]({ type: 'text', text: 'Saved\nresult' });
		expect(decoder.decode((await reader.read()).value)).toBe(
			'{"type":"text","text":"Saved\\nresult"}\n',
		);
		call[3]({ type: 'complete' });
		expect(decoder.decode((await reader.read()).value)).toBe('{"type":"complete"}\n');
		completion.resolve();
		expect((await reader.read()).done).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(['reader', 'request'] as const)(
		'forwards %s cancellation and releases heartbeat timers',
		async (source) => {
			const controller = new AbortController();
			const { completion, reader, call } = openResponse(controller.signal);
			await reader.read();
			if (source === 'reader') {
				await reader.cancel();
				expect(() => call[3]({ type: 'text', text: 'Too late' })).not.toThrow();
			} else {
				controller.abort();
			}
			expect(call[2].aborted).toBe(true);
			completion.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect((await reader.read()).done).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it('propagates rejected submissions before installing a heartbeat', () => {
		const error = new AppError('BUSY', 'Wait for the active run.', 409);
		const start = vi.fn<Chat['start']>(() => {
			throw error;
		});
		expect(() => chatResponse({ start }, command, new AbortController().signal)).toThrow(error);
		expect(vi.getTimerCount()).toBe(0);
	});
});
