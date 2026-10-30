import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopilotClientOptions, SessionConfig, Tool } from '@github/copilot-sdk';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Azure } from './azure';
import { configuration } from './config';
import { openStore, type Store } from './store';
import { Chat, sessionPolicy } from './chat';
import { metadata } from './schema';
import { mutateTodo, pendingApprovals, readTodos, approveDeletion } from './todos';

const fake = vi.hoisted(() => ({
	intent: 'read',
	execute: undefined as ((tools: Tool[]) => Promise<void>) | undefined,
	configs: [] as SessionConfig[],
	clients: [] as { options: CopilotClientOptions; stopped: boolean }[],
	ids: new Set<string>(),
	deleteFails: false,
	abortCount: 0,
	block: false,
	failure: undefined as 'classifier' | 'conversation' | undefined,
	reject: undefined as ((error: Error) => void) | undefined,
}));
vi.mock('@github/copilot-sdk', () => {
	class Session {
		sessionId: string;
		constructor(
			public config: SessionConfig,
			id: string = randomUUID(),
		) {
			this.sessionId = id;
			fake.ids.add(id);
			fake.configs.push(config);
		}
		rpc = {
			tools: {
				initializeAndValidate: async () => ({}),
				getCurrentMetadata: async () => ({
					tools: (this.config.tools ?? []).map((tool) => ({ name: tool.name })),
				}),
			},
		};
		on() {
			return () => {};
		}
		async sendAndWait() {
			const stage = this.config.tools?.length ? 'conversation' : 'classifier';
			if (fake.failure === stage) {
				throw new Error('Synthetic upstream failure containing private request context.');
			}
			if (!this.config.tools?.length) {
				return { intent: fake.intent };
			}
			await fake.execute?.(this.config.tools);
			if (fake.block) {
				await new Promise<never>((_, reject) => {
					fake.reject = reject;
				});
			}
			return { data: { content: 'Synthetic answer.' } };
		}
		async disconnect() {}
		async abort() {
			fake.abortCount++;
			fake.reject?.(new Error('Aborted'));
		}
	}
	return {
		defineTool: (name: string, definition: object) => ({ name, ...definition }),
		CopilotClient: class {
			private state;
			constructor(options: CopilotClientOptions) {
				this.state = { options, stopped: false };
				fake.clients.push(this.state);
			}
			async start() {}
			async stop() {
				this.state.stopped = true;
				return [];
			}
			async forceStop() {}
			async createSession(config: SessionConfig) {
				return new Session(config);
			}
			async resumeSession(id: string, config: SessionConfig) {
				if (!fake.ids.has(id)) {
					throw new Error('Missing context');
				}
				return new Session(config, id);
			}
			async deleteSession(id: string) {
				if (fake.deleteFails) {
					throw new Error('Synthetic cleanup failure');
				}
				fake.ids.delete(id);
			}
			async listSessions() {
				return [...fake.ids].map((id) => ({ sessionId: id }));
			}
		},
	};
});

let directory: string;
let store: Store;
let chat: Chat;
let azure: Azure;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-chat-'));
	store = openStore(join(directory, 'test.db'));
	const config = configuration({
		DATABASE_PATH: join(directory, 'test.db'),
		COPILOT_GITHUB_TOKEN: 'synthetic-token-not-real',
	});
	azure = new Azure(store, config);
	chat = new Chat(store, config, azure);
	fake.intent = 'read';
	fake.execute = undefined;
	fake.configs = [];
	fake.clients = [];
	fake.ids.clear();
	fake.deleteFails = false;
	fake.abortCount = 0;
	fake.block = false;
	fake.failure = undefined;
	fake.reject = undefined;
});
afterEach(async () => {
	fake.deleteFails = false;
	await chat.stop();
	store.sqlite.close();
	rmSync(directory, { recursive: true });
	vi.useRealTimers();
});

async function call(tools: Tool[], name: string, args: unknown, toolCallId = 'call-1') {
	const tool = tools.find((tool) => tool.name === name);
	if (!tool?.handler) {
		throw new Error(`Tool not registered: ${name}`);
	}
	return tool.handler(args, {
		sessionId: 'synthetic',
		toolCallId,
		toolName: name,
		arguments: args,
	});
}

function run(signal = new AbortController().signal) {
	return chat.start('Synthetic user request', randomUUID(), signal, () => {});
}

describe('bounded durable Copilot integration', () => {
	it('reads cached work and team-board scopes together without an upstream request', async () => {
		let result: unknown;
		fake.execute = async (tools) => {
			result = await call(tools, 'read_dashboard', {});
		};
		await run();
		expect(result).toEqual({
			ok: true,
			result: {
				incomplete: false,
				content: {
					snapshots: [],
					boardScopes: [],
					repositories: [],
					selection: { revision: 0, boards: 0, repositories: 0 },
				},
			},
		});
	});
	it('SET-007 rejects a new AI todo reference outside the selected scope without writing', async () => {
		fake.intent = 'mutate';
		let result: unknown;
		fake.execute = async (tools) => {
			result = await call(tools, 'mutate_todo', {
				operation: 'create',
				title: 'Must not be created',
				reference: {
					kind: 'workItem',
					organization: 'vertigis',
					project: 'Utilities',
					id: 7,
				},
			});
		};
		await run();
		expect(result).toMatchObject({ ok: false, code: 'SCOPE' });
		expect(readTodos(store).items).toEqual([]);
	});
	it.each(['classifier', 'conversation'] as const)(
		'OPS-007 logs the failing %s phase without upstream content',
		async (stage) => {
			fake.failure = stage;
			const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				await run();
				const entries = logger.mock.calls.map(([entry]) => JSON.parse(String(entry)));
				expect(entries).toContainEqual(
					expect.objectContaining({
						event: 'chat.run_failed',
						code: 'COPILOT_REQUEST',
						stage: `${stage}-request`,
					}),
				);
				expect(JSON.stringify(entries)).not.toContain('private request context');
				expect(chat.read().find((message) => message.role === 'assistant')).toMatchObject({
					status: 'failed',
					content: expect.stringContaining('Copilot could not complete the request.'),
				});
			} finally {
				logger.mockRestore();
			}
		},
	);
	it('AI-008 denies builtins, discovery and permissions on create/resume policy', () => {
		const policy = sessionPolicy([], 'model');
		expect(policy.availableTools).toEqual([]);
		expect(policy.excludedTools).toEqual(['builtin:*', 'mcp:*']);
		expect(policy.enableConfigDiscovery).toBe(false);
		expect(policy.enableSkills).toBe(false);
		expect(policy.onPermissionRequest()).toEqual({ kind: 'reject' });
	});
	it.each(['read', 'clarify'])(
		'AI-009 exposes no mutation tools for %s intent',
		async (intent) => {
			fake.intent = intent;
			await run();
			for (const policy of fake.configs) {
				expect(
					policy.tools?.some(
						(tool) => tool.name.includes('mutate') || tool.name.includes('deletion'),
					) ?? false,
				).toBe(false);
			}
			expect(readTodos(store).items).toEqual([]);
		},
	);
	it('AI-005/011 shares domain receipts and rejects dispatch after run completion', async () => {
		fake.intent = 'mutate';
		let registered: Tool[] = [];
		fake.execute = async (tools) => {
			registered = tools;
			await call(tools, 'mutate_todo', { operation: 'create', title: 'Saved once' });
			await call(tools, 'mutate_todo', { operation: 'create', title: 'Saved once' });
		};
		await run();
		expect(readTodos(store).items).toHaveLength(1);
		await expect(
			call(registered, 'mutate_todo', { operation: 'create', title: 'Too late' }, 'late'),
		).rejects.toThrow('no longer authorized');
		expect(readTodos(store).items).toHaveLength(1);
	});
	it('AI-004 validates wrapped detail references before passing them to the scoped adapter', async () => {
		const reference = {
			kind: 'workItem' as const,
			organization: 'vertigis',
			project: 'Utilities',
			id: 7,
		};
		const detail = vi.spyOn(azure, 'detail').mockResolvedValue({
			incomplete: false,
			content: 'Synthetic detail.',
		});
		try {
			fake.execute = async (tools) => {
				expect(await call(tools, 'read_azure_detail', { reference })).toMatchObject({
					ok: true,
					result: { incomplete: false, content: 'Synthetic detail.' },
				});
				expect(detail).toHaveBeenCalledWith(reference, expect.any(AbortSignal));
				expect(await call(tools, 'read_azure_detail', reference, 'invalid')).toMatchObject({
					ok: false,
					code: 'VALIDATION',
				});
				expect(detail).toHaveBeenCalledTimes(1);
			};
			await run();
		} finally {
			detail.mockRestore();
		}
	});
	it('AI-006 preserves references and surfaces stale conflicts as structured tool errors', async () => {
		const created = mutateTodo(store, {
			kind: 'create',
			title: 'Original',
			reference: {
				kind: 'workItem',
				organization: 'vertigis',
				project: 'Utilities',
				id: 7,
			},
			requestId: randomUUID(),
		});
		fake.intent = 'mutate';
		fake.execute = async (tools) => {
			await call(tools, 'mutate_todo', {
				operation: 'edit',
				id: created.todoId,
				revision: 1,
				title: 'Edited',
			});
			const failed = await call(
				tools,
				'mutate_todo',
				{ operation: 'edit', id: created.todoId, revision: 1, title: 'Stale' },
				'second',
			);
			expect(failed).toMatchObject({ ok: false, code: 'CONFLICT' });
		};
		await run();
		expect(readTodos(store).items[0]).toMatchObject({ title: 'Edited', reference: { id: 7 } });
	});
	it('AI-007 cannot delete through a model tool; UI approval is exact and one-use', async () => {
		const created = mutateTodo(store, {
			kind: 'create',
			title: 'Delete by approval',
			reference: null,
			requestId: randomUUID(),
		});
		fake.intent = 'mutate';
		fake.execute = async (tools) => {
			expect(
				tools.some((tool) => tool.name === 'delete_todo' || tool.name.includes('confirm')),
			).toBe(false);
			await call(tools, 'request_todo_deletion', { id: created.todoId, revision: 1 });
			await call(tools, 'request_todo_deletion', { id: created.todoId, revision: 1 });
		};
		await run();
		expect(readTodos(store).items).toHaveLength(1);
		expect(pendingApprovals(store)).toHaveLength(1);
		const approval = pendingApprovals(store)[0];
		if (!approval) {
			throw new Error('Missing approval');
		}
		approveDeletion(store, approval.id, true, randomUUID());
		expect(readTodos(store).items).toEqual([]);
		expect(() => approveDeletion(store, approval.id, true, randomUUID())).toThrow();
	});
	it('AI-011 includes classification in the ten-invocation budget', async () => {
		fake.intent = 'mutate';
		fake.execute = async (tools) => {
			for (let index = 0; index < 10; index++) {
				await call(
					tools,
					'mutate_todo',
					{ operation: 'create', title: `Task ${index}` },
					`call-${index}`,
				);
			}
		};
		await run();
		expect(readTodos(store).items).toHaveLength(9);
		expect(chat.read().some((message) => message.status === 'interrupted')).toBe(true);
	});
	it('AI-002 resumes the durable session with freshly read-only tools', async () => {
		fake.intent = 'mutate';
		await run();
		const sessionId = store.db
			.select()
			.from(metadata)
			.where(eq(metadata.key, 'sdkSession'))
			.get()?.value;
		expect(sessionId).toBeTruthy();
		fake.intent = 'read';
		await run();
		expect(
			store.db.select().from(metadata).where(eq(metadata.key, 'sdkSession')).get()?.value,
		).toBe(sessionId);
		expect(fake.configs.at(-1)?.tools?.map((tool) => tool.name)).toEqual([
			'list_todos',
			'read_dashboard',
			'read_azure_detail',
		]);
	});
	it('AI-013 retains explicit pending cleanup on failure and succeeds on retry', async () => {
		await run();
		const before = chat.read();
		fake.deleteFails = true;
		await expect(chat.clear()).rejects.toThrow('incomplete');
		expect(chat.cleanupPending).toBe(true);
		expect(chat.read()).toEqual(before);
		fake.deleteFails = false;
		await chat.clear();
		expect(chat.cleanupPending).toBe(false);
		expect(chat.read()).toEqual([]);
		expect(fake.ids.size).toBe(0);
	});
	it.each([false, true])(
		'AI-013 starts an authenticated client after clearing (cleanup retry: %s)',
		async (retry) => {
			await run();
			if (retry) {
				fake.deleteFails = true;
				await expect(chat.clear()).rejects.toThrow('incomplete');
				fake.deleteFails = false;
			}
			await chat.clear();
			const cleanupClient = fake.clients.at(-1);
			expect(cleanupClient?.options.gitHubToken).toBeUndefined();
			expect(cleanupClient?.stopped).toBe(true);

			await run();
			expect(fake.clients.at(-1)).not.toBe(cleanupClient);
			expect(fake.clients.at(-1)?.options.gitHubToken).toBe('synthetic-token-not-real');
			expect(chat.read().find((message) => message.role === 'assistant')).toMatchObject({
				content: 'Synthetic answer.',
				status: 'complete',
			});
		},
	);
	it('AI-011 cancels active work, preserves committed writes and prevents future dispatch', async () => {
		fake.intent = 'mutate';
		fake.block = true;
		let registered: Tool[] = [];
		fake.execute = async (tools) => {
			registered = tools;
			await call(tools, 'mutate_todo', { operation: 'create', title: 'Already committed' });
		};
		const controller = new AbortController();
		const done = run(controller.signal);
		await vi.waitFor(() => expect(fake.reject).toBeTypeOf('function'));
		controller.abort();
		await done;
		expect(fake.abortCount).toBeGreaterThan(0);
		expect(readTodos(store).items).toHaveLength(1);
		await expect(
			call(registered, 'mutate_todo', { operation: 'create', title: 'After cancel' }, 'late'),
		).rejects.toThrow();
	});
	it('AI-011 enforces a total 120-second deadline', async () => {
		vi.useFakeTimers();
		fake.block = true;
		const done = run();
		await vi.advanceTimersByTimeAsync(1);
		await vi.advanceTimersByTimeAsync(120000);
		await done;
		expect(chat.running).toBe(false);
		expect(chat.read().some((message) => message.status === 'interrupted')).toBe(true);
	});
});
