import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { Configuration } from './config';
import { AppError } from './errors';

const responseSchema = z.record(z.string(), z.unknown());

/** JSON request options; Graph selects the fixed Graph host/version, never an arbitrary origin. */
export interface AzureRequestOptions {
	graph?: boolean;
	body?: unknown;
	signal?: AbortSignal;
}

function retrySeconds(retry: string | null, attempt: number): number {
	if (!retry) {
		return attempt + 1;
	}
	if (/^\d+$/.test(retry)) {
		return Number(retry);
	}
	return Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
}

/**
 * Sends authenticated, no-store JSON to the configured ADO organization without redirects.
 * Each attempt has a 15s timeout; only 429/5xx responses retry, at most three attempts.
 * Retry-After over 30s/invalid values, HTTP failures, and transport failures throw safe AppErrors;
 * malformed JSON/response shapes propagate for the service to annotate per scope.
 */
export async function requestAzure(
	settings: NonNullable<Configuration['ado']>,
	path: string,
	options: AzureRequestOptions = {},
	transport: typeof fetch = fetch,
) {
	const url = new URL(
		`https://${options.graph ? 'vssps.' : ''}dev.azure.com/${encodeURIComponent(settings.org)}/${path}`,
	);
	if (!url.searchParams.has('api-version')) {
		url.searchParams.set('api-version', options.graph ? '7.1-preview.1' : '7.1');
	}
	for (let attempt = 0; attempt < 3; attempt++) {
		let response: Response;
		try {
			response = await transport(url, {
				method: options.body === undefined ? 'GET' : 'POST',
				headers: {
					Authorization: `Basic ${Buffer.from(`:${settings.token}`).toString('base64')}`,
					'Content-Type': 'application/json',
				},
				...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
				signal: AbortSignal.any([
					AbortSignal.timeout(15000),
					...(options.signal ? [options.signal] : []),
				]),
				redirect: 'error',
				cache: 'no-store',
			});
		} catch {
			throw new AppError(
				'ADO_CONNECTION',
				'Azure DevOps could not be reached. Check connectivity and retry.',
				502,
			);
		}
		if (response.ok) {
			return {
				data: responseSchema.parse(await response.json()),
				continuation:
					response.headers.get('x-ms-continuationtoken') ??
					response.headers.get('x-ms-continuation-token'),
			};
		}
		if ((response.status === 429 || response.status >= 500) && attempt < 2) {
			const seconds = retrySeconds(response.headers.get('retry-after'), attempt);
			if (!Number.isFinite(seconds) || seconds > 30) {
				throw new AppError(
					'ADO_THROTTLED',
					'Azure DevOps requested a longer retry delay. Cached data is retained.',
					503,
				);
			}
			await delay(seconds * 1000, undefined, { signal: options.signal }).catch(
				(error: unknown) => {
					if (options.signal?.aborted) {
						throw new AppError('CANCELLED', 'Azure DevOps refresh was cancelled.', 503);
					}
					throw error;
				},
			);
			continue;
		}
		throw new AppError(
			'ADO_HTTP',
			response.status === 401 || response.status === 403
				? 'Azure DevOps denied access. Check PAT expiry, Code/Work Items/Graph/Project and Team read scopes, and project permissions.'
				: `Azure DevOps returned HTTP ${response.status}. The scope was not replaced.`,
			502,
		);
	}
	throw new AppError('ADO_RETRY', 'Azure DevOps retry budget exhausted.', 502);
}
