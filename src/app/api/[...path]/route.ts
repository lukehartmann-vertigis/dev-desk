import { z } from 'zod';
import { mutationSchema, referenceSchema, saveSettingsSchema } from '../../../lib/contracts';
import { AppError } from '../../../server/errors';
import { body, failure, json, protect } from '../../../server/http';
import { runtime as application } from '../../../server/runtime';
import { approveDeletion, mutateTodoWithReference } from '../../../server/todos';
import { chatResponse } from '../../../server/chat-response';

/** Native SQLite and the managed SDK require the Node.js route runtime. */
export const runtime = 'nodejs';
/** Private workspace state and streams must never be prerendered or statically cached. */
export const dynamic = 'force-dynamic';

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
	try {
		const app = application();
		protect(request, app.config.origin);
		const path = (await context.params).path.join('/');
		if (request.method === 'GET') {
			if (path === 'state') {
				return json(app.state());
			}
			if (path === 'settings') {
				return json(app.sourceSettings());
			}
			if (path === 'health') {
				app.store.sqlite.prepare('SELECT 1').get();
				return json({
					live: true,
					ready: true,
					integrations: {
						ado: app.config.adoStatus.state,
						copilot: app.config.copilotStatus.state,
					},
				});
			}
		} else if (request.method === 'POST') {
			const input = await body(request);
			if (app.stopping) {
				throw new AppError('STOPPING', 'The application is shutting down.', 503);
			}
			if (path === 'settings/catalog') {
				z.object({}).parse(input);
				return json(await app.azure.discover(request.signal));
			}
			if (path === 'settings') {
				await app.azure.saveSelection(saveSettingsSchema.parse(input), request.signal);
				return json(app.sourceSettings());
			}
			if (path === 'todos') {
				await mutateTodoWithReference(
					app.store,
					mutationSchema.parse(input),
					app.azure,
					request.signal,
				);
				return json(app.state());
			}
			if (path === 'reference') {
				const { url } = z.object({ url: z.url().max(2048) }).parse(input);
				return json({ reference: app.azure.parseUrl(url), verified: false });
			}
			if (path === 'reference/check') {
				return json(await app.azure.verify(referenceSchema.parse(input), request.signal));
			}
			if (path === 'refresh') {
				void app.azure.refresh();
				return json(app.state(), 202);
			}
			if (path === 'approval') {
				const command = z
					.object({ id: z.string().min(1), accept: z.boolean(), requestId: z.uuid() })
					.parse(input);
				approveDeletion(app.store, command.id, command.accept, command.requestId);
				return json(app.state());
			}
			if (path === 'chat/cancel') {
				await app.chat.cancel();
				return json(app.state());
			}
			if (path === 'chat/clear') {
				z.object({ confirmed: z.literal(true) }).parse(input);
				await app.chat.clear();
				return json(app.state());
			}
			if (path === 'chat') {
				const command = z
					.object({ prompt: z.string().trim().min(1).max(8000), requestId: z.uuid() })
					.parse(input);
				return chatResponse(app.chat, command, request.signal);
			}
		}
		throw new AppError('NOT_FOUND', 'Unknown API operation.', 404);
	} catch (error) {
		return failure(error);
	}
}
/** Reads local state/health after host validation; failures are redacted no-store JSON. */
export const GET = handle;
/** Validates same-origin commands and delegates writes, provider reads, and NDJSON streaming. */
export const POST = handle;
