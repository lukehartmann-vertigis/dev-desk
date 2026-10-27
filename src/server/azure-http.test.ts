import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestAzure } from './azure-http';
import { configuration } from './config';

const settings = configuration({ AZURE_DEVOPS_PAT: 'synthetic-only' }).ado;
if (!settings) {
	throw new Error('Expected valid synthetic ADO settings.');
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('bounded ADO HTTP boundary', () => {
	it.each([
		{ graph: false, path: '_apis/projects', host: 'dev.azure.com', version: '7.1' },
		{
			graph: true,
			path: '_apis/graph/users',
			host: 'vssps.dev.azure.com',
			version: '7.1-preview.1',
		},
		{
			graph: false,
			path: '_apis/connectionData?api-version=7.1-preview.1',
			host: 'dev.azure.com',
			version: '7.1-preview.1',
		},
	])(
		'retains the fixed $host host and $version version',
		async ({ graph, path, host, version }) => {
			const transport = vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					Response.json(
						{ value: [] },
						{ headers: { 'x-ms-continuation-token': 'next' } },
					),
				);
			const timeout = vi.spyOn(AbortSignal, 'timeout');
			const result = await requestAzure(
				settings,
				path,
				{ graph, body: { ids: [1] } },
				transport,
			);
			const call = transport.mock.calls[0];
			if (!call) {
				throw new Error('Expected one transport request.');
			}
			const url = new URL(String(call[0]));
			expect(url.hostname).toBe(host);
			expect(url.pathname).toBe(`/vertigis/${path.split('?')[0]}`);
			expect(url.searchParams.get('api-version')).toBe(version);
			expect(call[1]).toMatchObject({
				method: 'POST',
				body: '{"ids":[1]}',
				cache: 'no-store',
				redirect: 'error',
				headers: {
					Authorization: `Basic ${Buffer.from(':synthetic-only').toString('base64')}`,
				},
			});
			expect(timeout).toHaveBeenCalledWith(15000);
			expect(result).toEqual({ data: { value: [] }, continuation: 'next' });
		},
	);

	it.each([null, '0', '2', 'Tue, 27 Oct 2026 10:00:02 GMT'])(
		'retries a transient response with Retry-After %s',
		async (retry) => {
			const headers = retry === null ? {} : { 'Retry-After': retry };
			const transport = vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(new Response('', { status: 429, headers }))
				.mockResolvedValueOnce(Response.json({ value: ['ok'] }));
			const result = requestAzure(settings, '_apis/projects', {}, transport);
			const assertion = expect(result).resolves.toMatchObject({ data: { value: ['ok'] } });
			await vi.runAllTimersAsync();
			await assertion;
			expect(transport).toHaveBeenCalledTimes(2);
		},
	);

	it('limits retryable server failures to three attempts', async () => {
		const transport = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('', { status: 503 }));
		const assertion = expect(
			requestAzure(settings, '_apis/projects', {}, transport),
		).rejects.toMatchObject({ code: 'ADO_HTTP', status: 502 });
		await vi.runAllTimersAsync();
		await assertion;
		expect(transport).toHaveBeenCalledTimes(3);
	});

	it.each(['31', 'not-a-delay'])('rejects unsafe retry delays: %s', async (retry) => {
		const transport = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response('', { status: 429, headers: { 'Retry-After': retry } }),
			);
		await expect(requestAzure(settings, '_apis/projects', {}, transport)).rejects.toMatchObject(
			{ code: 'ADO_THROTTLED', status: 503 },
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it('honors cancellation while waiting to retry', async () => {
		const transport = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '10' } }));
		const controller = new AbortController();
		const assertion = expect(
			requestAzure(settings, '_apis/projects', { signal: controller.signal }, transport),
		).rejects.toMatchObject({ code: 'CANCELLED' });
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		await assertion;
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it('redacts network errors without retrying arbitrary transport failures', async () => {
		const transport = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new Error('private upstream content'));
		await expect(requestAzure(settings, '_apis/projects', {}, transport)).rejects.toMatchObject(
			{ code: 'ADO_CONNECTION', status: 502 },
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});

	it('does not retry denied access', async () => {
		const transport = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response('', { status: 403 }));
		await expect(requestAzure(settings, '_apis/projects', {}, transport)).rejects.toMatchObject(
			{ code: 'ADO_HTTP', status: 502 },
		);
		expect(transport).toHaveBeenCalledTimes(1);
	});
});
