import { AppError, safeError } from './errors';

/**
 * Enforces the configured local host and, for mutations, same-origin marked JSON requests.
 * Throws client-safe 403/415 errors before request content or credentials are used.
 */
export function protect(request: Request, origin: string) {
	const expected = new URL(origin);
	const allowed = new Set([
		expected.host,
		`localhost:${expected.port || '80'}`,
		`127.0.0.1:${expected.port || '80'}`,
	]);
	const host = request.headers.get('host');
	if (!host || !allowed.has(host)) {
		throw new AppError('HOST', 'Untrusted request host.', 403);
	}
	if (request.method !== 'GET') {
		const supplied = request.headers.get('origin');
		if (
			!supplied ||
			![
				expected.origin,
				`http://localhost:${expected.port || '80'}`,
				`http://127.0.0.1:${expected.port || '80'}`,
			].includes(supplied)
		) {
			throw new AppError('ORIGIN', 'Cross-origin requests are not allowed.', 403);
		}
		if (
			request.headers.get('x-devdesk-request') !== '1' ||
			request.headers.get('content-type')?.split(';')[0] !== 'application/json'
		) {
			throw new AppError('CONTENT_TYPE', 'Use the same-origin JSON application client.', 415);
		}
		if (request.headers.get('sec-fetch-site') === 'cross-site') {
			throw new AppError('ORIGIN', 'Cross-site requests are not allowed.', 403);
		}
	}
}
/** Reads JSON up to 64 KiB, cancelling oversized streams; missing/invalid bodies throw AppError. */
export async function body(request: Request): Promise<unknown> {
	const reader = request.body?.getReader();
	if (!reader) {
		throw new AppError('BODY', 'A JSON request body is required.');
	}
	let text = '';
	let size = 0;
	const decoder = new TextDecoder();
	for (;;) {
		const part = await reader.read();
		if (part.done) {
			break;
		}
		size += part.value.byteLength;
		if (size > 65536) {
			await reader.cancel();
			throw new AppError('BODY_SIZE', 'The request is too large.', 413);
		}
		text += decoder.decode(part.value, { stream: true });
	}
	text += decoder.decode();
	try {
		return JSON.parse(text);
	} catch {
		throw new AppError('JSON', 'The request body is not valid JSON.');
	}
}
/** Serializes a private response with no-store caching; serialization failures propagate. */
export function json(value: unknown, status = 200) {
	return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
/** Translates failures into no-store JSON, preserving trusted status/codes and redacting unknowns. */
export function failure(error: unknown) {
	const safe = safeError(error);
	return json({ error: safe.message, code: safe.code }, safe.status);
}
