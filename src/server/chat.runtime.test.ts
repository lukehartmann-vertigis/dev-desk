import { CopilotClient, defineTool } from '@github/copilot-sdk';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { azureDetailInputSchema, sessionPolicy } from './chat';

it('AI-008/012/013: native runtime enforces production policy on create/resume and deletes state', async () => {
	const directory = mkdtempSync(join(tmpdir(), 'devdesk-native-'));
	const client = new CopilotClient({
		mode: 'empty',
		baseDirectory: directory,
		workingDirectory: directory,
		useLoggedInUser: false,
		logLevel: 'none',
		env: {
			PATH: process.env.PATH,
			HOME: directory,
			COPILOT_GITHUB_TELEMETRY_DISABLED: 'true',
		},
	});
	const tool = (name: string) =>
		defineTool(name, {
			description:
				'Return a synthetic policy-test result without accessing application data.',
			parameters: { type: 'object', properties: {}, additionalProperties: false },
			skipPermission: true,
			handler: async () => ({ synthetic: true }),
		});
	try {
		await client.start();
		expect((await client.getAuthStatus()).isAuthenticated).toBe(false);
		const read = tool('list_todos');
		const detail = defineTool('read_azure_detail', {
			description: 'Validate the production detail input without accessing Azure DevOps.',
			parameters: z.toJSONSchema(azureDetailInputSchema),
			skipPermission: true,
			handler: async (args) => ({
				synthetic: true,
				reference: azureDetailInputSchema.parse(args).reference,
			}),
		});
		const session = await client.createSession({
			...sessionPolicy([read, detail, tool('mutate_todo')], 'gpt-4.1'),
			name: 'DevDesk native policy contract',
		});
		await session.rpc.tools.initializeAndValidate();
		expect(
			(await session.rpc.tools.getCurrentMetadata()).tools?.map((entry) => entry.name).sort(),
		).toEqual(['list_todos', 'mutate_todo', 'read_azure_detail']);
		const id = session.sessionId;
		await session.disconnect();
		expect(await client.stop()).toEqual([]);
		await client.start();
		const resumed = await client.resumeSession(id, sessionPolicy([read, detail], 'gpt-4.1'));
		await resumed.rpc.tools.initializeAndValidate();
		expect(
			(await resumed.rpc.tools.getCurrentMetadata()).tools?.map((entry) => entry.name).sort(),
		).toEqual(['list_todos', 'read_azure_detail']);
		for (const reference of [
			{ kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 7 },
			{
				kind: 'pullRequest',
				organization: 'vertigis',
				project: 'Utilities',
				repositoryId: '446326e4-f451-4018-99ec-e80e667cbec2',
				id: 8,
			},
		]) {
			const result = await resumed.rpc.tools.execute({
				name: 'read_azure_detail',
				arguments: { reference },
			});
			expect(result).toMatchObject({ resultType: 'success' });
			if (typeof result === 'string') {
				throw new Error('Expected structured native tool result');
			}
			expect(JSON.parse(result.textResultForLlm)).toEqual({ synthetic: true, reference });
		}
		const allowed = await resumed.rpc.tools.execute({ name: 'list_todos', arguments: {} });
		expect(allowed).toMatchObject({ resultType: 'success' });
		for (const name of ['bash', 'mutate_todo']) {
			expect(await resumed.rpc.tools.execute({ name, arguments: {} })).toMatchObject({
				resultType: 'failure',
			});
		}
		await resumed.disconnect();
		await client.deleteSession(id);
		expect((await client.listSessions()).some((entry) => entry.sessionId === id)).toBe(false);
		expect(await client.stop()).toEqual([]);
		expect(
			readdirSync(directory, { recursive: true, encoding: 'utf8' }).some((path) =>
				path.split('/').includes(id),
			),
		).toBe(false);
	} finally {
		const errors = await client.stop();
		if (errors.length) {
			await client.forceStop();
		}
		rmSync(directory, { recursive: true });
		expect(errors).toEqual([]);
	}
}, 20000);
