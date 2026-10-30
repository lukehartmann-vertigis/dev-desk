import { z } from 'zod';
import type { Mutation } from '../../lib/contracts';
/** A UI command whose retry identity is assigned by the dashboard controller. */
export type ClientCommand<T> = T extends Mutation ? Omit<T, 'requestId'> : never;
/** Same-origin JSON marker required by the local mutation boundary. */
export const headers = { 'Content-Type': 'application/json', 'X-Devdesk-Request': '1' };
/** Fetches no-store state or marked JSON commands; rejects HTTP errors and invalid response shapes. */
export async function api<T>(
	path: string,
	schema: z.ZodType<T>,
	value?: unknown,
	signal?: AbortSignal,
): Promise<T> {
	const response = await fetch(
		`/api/${path}`,
		value === undefined
			? { cache: 'no-store', signal: signal ?? null }
			: { method: 'POST', headers, body: JSON.stringify(value), signal: signal ?? null },
	);
	const data: unknown = await response.json();
	if (!response.ok) {
		throw new Error(z.object({ error: z.string() }).parse(data).error);
	}
	return schema.parse(data);
}
