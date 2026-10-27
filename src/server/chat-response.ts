import type { Chat } from './chat';

/**
 * Starts a validated chat command and returns uncached NDJSON with 5s heartbeats.
 * Request/reader cancellation aborts future tool dispatch; committed writes remain durable.
 * Synchronous start failures propagate to the route's error boundary.
 */
export function chatResponse(
	chat: Pick<Chat, 'start'>,
	command: { prompt: string; requestId: string },
	signal: AbortSignal,
) {
	const abort = new AbortController();
	const encoder = new TextEncoder();
	let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
	let closed = false;
	const stream = new ReadableStream<Uint8Array>({
		start(value) {
			controller = value;
		},
		cancel() {
			closed = true;
			abort.abort();
		},
	});
	const notify = (value: unknown) => {
		if (!closed) {
			controller?.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
		}
	};
	const done = chat.start(
		command.prompt,
		command.requestId,
		AbortSignal.any([abort.signal, signal]),
		notify,
	);
	notify({ type: 'started' });
	const heartbeat = setInterval(() => notify({ type: 'heartbeat' }), 5000);
	void done.finally(() => {
		clearInterval(heartbeat);
		if (!closed) {
			closed = true;
			controller?.close();
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-store',
			'X-Accel-Buffering': 'no',
		},
	});
}
