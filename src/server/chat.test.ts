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
import { readHandoff } from './handoffs';
import { conversations, handoffVersions, messages, runs } from './schema';
import { readSettings, writeSettings } from './settings';
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
	failure: undefined as 'classifier' | 'conversation' | 'after-tools' | undefined,
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
			if (fake.failure === 'after-tools') {
				throw new Error('Synthetic stream failure after committed tools.');
			}
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
let conversationId: string | undefined;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-chat-'));
	store = openStore(join(directory, 'test.db'));
	const config = configuration({
		DATABASE_PATH: join(directory, 'test.db'),
		COPILOT_GITHUB_TOKEN: 'synthetic-token-not-real',
	});
	azure = new Azure(store, config);
	chat = new Chat(store, config, azure);
	conversationId = undefined;
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

/** Continues the current test chat, creating one on first use, and awaits the run. */
function run(signal = new AbortController().signal, prompt = 'Synthetic user request') {
	const started = chat.start(
		{ prompt, requestId: randomUUID(), conversationId },
		signal,
		() => {},
	);
	conversationId = started.conversationId;
	return started.done;
}

function transcript() {
	return chat.read(conversationId ?? null);
}

function current() {
	if (!conversationId) {
		throw new Error('No test conversation');
	}
	return conversationId;
}

const workItem = {
	kind: 'workItem' as const,
	organization: 'vertigis',
	project: 'Utilities',
	id: 7,
};

function handoffArgs(overrides: Record<string, unknown> = {}) {
	return {
		reference: workItem,
		title: 'Synthetic handoff',
		content: {
			goal: 'Plan the synthetic change.',
			description: 'Synthetic description.',
			discussion: [],
			acceptanceCriteria: ['Criterion from the ticket'],
			proposedCriteria: [],
			constraints: [],
			targetRepository: null,
			assumptions: [],
			openQuestions: [],
			limitations: [],
		},
		...overrides,
	};
}

/** Lets handoff tests read a scoped work item without real Azure DevOps access. */
function allowWorkItem(incomplete = false) {
	vi.spyOn(azure, 'detail').mockResolvedValue({ incomplete, content: 'Synthetic detail.' });
	vi.spyOn(azure, 'validate').mockReturnValue({
		id: '11111111-1111-4111-8111-111111111111',
		projectId: '22222222-2222-4222-8222-222222222222',
		project: 'Utilities',
		name: 'Team',
	});
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
				expect(transcript().find((message) => message.role === 'assistant')).toMatchObject({
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
		expect(pendingApprovals(store, current())).toHaveLength(1);
		const approval = pendingApprovals(store, current())[0];
		if (!approval) {
			throw new Error('Missing approval');
		}
		approveDeletion(store, approval.id, true, randomUUID(), current());
		expect(readTodos(store).items).toEqual([]);
		expect(() => approveDeletion(store, approval.id, true, randomUUID(), current())).toThrow();
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
		expect(transcript().some((message) => message.status === 'interrupted')).toBe(true);
	});
	it('AI-002 resumes the durable session with freshly read-only tools', async () => {
		fake.intent = 'mutate';
		await run();
		const sessionId = chat.conversation(current())?.sdkSessionId;
		expect(sessionId).toBeTruthy();
		fake.intent = 'read';
		await run();
		expect(chat.conversation(current())?.sdkSessionId).toBe(sessionId);
		expect(fake.configs.at(-1)?.tools?.map((tool) => tool.name)).toEqual([
			'list_todos',
			'read_dashboard',
			'read_azure_detail',
		]);
	});
	it('AI-021 retains explicit pending cleanup on failure and succeeds on retry', async () => {
		await run();
		const before = transcript();
		fake.deleteFails = true;
		await expect(chat.remove(current())).rejects.toThrow('incomplete');
		expect(chat.conversations()).toEqual([
			expect.objectContaining({ id: current(), cleanupPending: true }),
		]);
		expect(transcript()).toEqual(before);
		expect(() =>
			chat.start(
				{ prompt: 'Resume', requestId: randomUUID(), conversationId: current() },
				new AbortController().signal,
				() => {},
			),
		).toThrow('cannot continue');
		fake.deleteFails = false;
		await chat.remove(current());
		expect(chat.conversations()).toEqual([]);
		expect(transcript()).toEqual([]);
		expect(fake.ids.size).toBe(0);
	});
	it.each([false, true])(
		'AI-021 starts an authenticated client after removing a chat (cleanup retry: %s)',
		async (retry) => {
			await run();
			if (retry) {
				fake.deleteFails = true;
				await expect(chat.remove(current())).rejects.toThrow('incomplete');
				fake.deleteFails = false;
			}
			await chat.remove(current());
			const cleanupClient = fake.clients.at(-1);
			expect(cleanupClient?.options.gitHubToken).toBeUndefined();
			expect(cleanupClient?.stopped).toBe(true);

			conversationId = undefined;
			await run();
			expect(fake.clients.at(-1)).not.toBe(cleanupClient);
			expect(fake.clients.at(-1)?.options.gitHubToken).toBe('synthetic-token-not-real');
			expect(transcript().find((message) => message.role === 'assistant')).toMatchObject({
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
		expect(transcript().some((message) => message.status === 'interrupted')).toBe(true);
	});
});

describe('durable independent conversations', () => {
	it('AI-018/020 keeps chats, transcripts and SDK sessions isolated and resumes the selected one', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-03T10:00:00.000Z'));
		await run(undefined, 'First chat request');
		const first = current();
		const firstSession = chat.conversation(first)?.sdkSessionId;
		conversationId = undefined;
		vi.setSystemTime(new Date('2026-11-03T10:01:00.000Z'));
		await run(undefined, 'Second chat request');
		const second = current();
		const secondSession = chat.conversation(second)?.sdkSessionId;
		expect(second).not.toBe(first);
		expect(secondSession).toBeTruthy();
		expect(secondSession).not.toBe(firstSession);
		expect(chat.read(first).map((message) => message.content)).toContain('First chat request');
		expect(chat.read(first).map((message) => message.content)).not.toContain(
			'Second chat request',
		);
		expect(chat.conversations().map((entry) => entry.id)).toEqual([second, first]);
		expect(chat.conversations()[1]).toMatchObject({
			title: 'First chat request',
			cleanupPending: false,
		});
		conversationId = first;
		vi.setSystemTime(new Date('2026-11-03T10:02:00.000Z'));
		await run(undefined, 'Continue first');
		expect(chat.conversation(first)?.sdkSessionId).toBe(firstSession);
		expect(chat.conversations().map((entry) => entry.id)).toEqual([first, second]);
		expect(chat.read(second).map((message) => message.content)).not.toContain('Continue first');
	});
	it('AI-027 stores the user message without a run and links the run to it', async () => {
		await run(undefined, 'Owned by the chat');
		const user = transcript().find((message) => message.role === 'user');
		expect(user).toMatchObject({ runId: null, content: 'Owned by the chat' });
		const stored = store.db.select().from(runs).where(eq(runs.conversationId, current())).all();
		expect(stored).toEqual([expect.objectContaining({ requestMessageId: user?.id })]);
		expect(transcript().find((message) => message.role === 'assistant')?.runId).toBe(
			stored[0]?.id,
		);
	});
	it('AI-020 rejects unknown chats before persisting anything', () => {
		expect(() =>
			chat.start(
				{ prompt: 'Lost', requestId: randomUUID(), conversationId: randomUUID() },
				new AbortController().signal,
				() => {},
			),
		).toThrow('no longer exists');
		expect(store.db.select().from(messages).all()).toEqual([]);
	});
	it('AI-021 removes only the confirmed chat and refuses while another chat runs', async () => {
		await run();
		const kept = current();
		const keptSession = chat.conversation(kept)?.sdkSessionId;
		conversationId = undefined;
		await run();
		const removed = current();
		fake.block = true;
		conversationId = kept;
		const controller = new AbortController();
		const pending = run(controller.signal);
		await vi.waitFor(() => expect(fake.reject).toBeTypeOf('function'));
		await expect(chat.remove(removed)).rejects.toThrow('another chat');
		controller.abort();
		await pending;
		fake.block = false;
		await chat.remove(removed);
		expect(chat.conversations().map((entry) => entry.id)).toEqual([kept]);
		expect(chat.read(removed)).toEqual([]);
		expect(keptSession && fake.ids.has(keptSession)).toBe(true);
		expect(chat.read(kept).length).toBeGreaterThan(0);
	});
});

describe('validated planning handoff tool', () => {
	it('AI-023 exposes only read tools plus handoff creation for a handoff request', async () => {
		fake.intent = 'handoff';
		await run();
		expect(fake.configs.at(-1)?.tools?.map((tool) => tool.name)).toEqual([
			'list_todos',
			'read_dashboard',
			'read_azure_detail',
			'create_planning_handoff',
		]);
	});
	it('AI-023 requires the work item to be read in the same request before saving', async () => {
		fake.intent = 'handoff';
		allowWorkItem();
		let result: unknown;
		fake.execute = async (tools) => {
			result = await call(tools, 'create_planning_handoff', handoffArgs());
		};
		await run();
		expect(result).toMatchObject({ ok: false, code: 'SOURCE_REQUIRED' });
		expect(store.db.select().from(handoffVersions).all()).toEqual([]);
	});
	it('AI-023 rejects invalid payloads and superseded source scope without artifacts', async () => {
		fake.intent = 'handoff';
		allowWorkItem();
		const results: unknown[] = [];
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			results.push(
				await call(
					tools,
					'create_planning_handoff',
					handoffArgs({ content: { goal: '' } }),
					'invalid',
				),
			);
			writeSettings(store, readSettings(store, 'vertigis'));
			results.push(await call(tools, 'create_planning_handoff', handoffArgs(), 'stale'));
		};
		await run();
		expect(results).toEqual([
			expect.objectContaining({ ok: false, code: 'VALIDATION' }),
			expect.objectContaining({
				ok: false,
				error: expect.stringContaining('sources changed'),
			}),
		]);
		expect(store.db.select().from(handoffVersions).all()).toEqual([]);
	});
	it('AI-023/024/027 saves one exact version with provenance, replay safety and revisions', async () => {
		fake.intent = 'handoff';
		allowWorkItem(true);
		const results: unknown[] = [];
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			results.push(await call(tools, 'create_planning_handoff', handoffArgs(), 'save'));
			results.push(await call(tools, 'create_planning_handoff', handoffArgs(), 'save'));
			results.push(
				await call(
					tools,
					'create_planning_handoff',
					handoffArgs({ title: 'Changed content' }),
					'save',
				),
			);
		};
		await run(undefined, 'Prepare a planning handoff for ticket 7');
		const created = results[0] as { ok: true; result: { handoffId: string; version: number } };
		expect(created).toMatchObject({ ok: true, result: { version: 1 } });
		expect(results[1]).toEqual(created);
		expect(results[2]).toMatchObject({ ok: false, code: 'REQUEST_REUSED' });
		const versions = store.db.select().from(handoffVersions).all();
		expect(versions).toHaveLength(1);
		const user = transcript().find((message) => message.role === 'user');
		const run0 = store.db.select().from(runs).get();
		expect(versions[0]).toMatchObject({
			originMessageId: user?.id,
			originRunId: run0?.id,
			sourceIncomplete: true,
		});
		const references = transcript().filter((message) => message.handoff);
		expect(references).toHaveLength(1);
		expect(references[0]?.handoff).toMatchObject({
			state: 'available',
			version: 1,
			title: 'Synthetic handoff',
		});
		const markdown =
			references[0]?.handoff?.state === 'available' ? references[0].handoff.markdown : '';
		expect(markdown).toContain('Planning request only');
		expect(markdown).toContain('https://dev.azure.com/vertigis/Utilities/_workitems/edit/7');
		expect(markdown).toContain('Retrieved ticket context was truncated or incomplete.');

		results.length = 0;
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			results.push(
				await call(
					tools,
					'create_planning_handoff',
					handoffArgs({ title: 'Revised', reviseHandoffId: created.result.handoffId }),
					'revise',
				),
			);
			results.push(
				await call(
					tools,
					'create_planning_handoff',
					handoffArgs({ reviseHandoffId: randomUUID() }),
					'missing',
				),
			);
			results.push(
				await call(
					tools,
					'create_planning_handoff',
					handoffArgs({
						reference: { ...workItem, id: 8 },
						reviseHandoffId: created.result.handoffId,
					}),
					'other-ticket',
				),
			);
		};
		await run();
		expect(results).toEqual([
			expect.objectContaining({ ok: true, result: expect.objectContaining({ version: 2 }) }),
			expect.objectContaining({ ok: false, code: 'NOT_FOUND' }),
			expect.objectContaining({ ok: false }),
		]);
		const detail = readHandoff(store, created.result.handoffId);
		expect(detail.versions.map((version) => [version.version, version.title])).toEqual([
			[1, 'Synthetic handoff'],
			[2, 'Revised'],
		]);
		expect(transcript().filter((message) => message.handoff)).toHaveLength(2);
	});
	it('AI-016/023 keeps a committed handoff when the later assistant stream fails', async () => {
		fake.intent = 'handoff';
		fake.failure = 'after-tools';
		allowWorkItem();
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			await call(tools, 'create_planning_handoff', handoffArgs(), 'save');
		};
		await run();
		expect(transcript().find((message) => message.role === 'assistant')?.status).toBe('failed');
		expect(transcript().find((message) => message.handoff)?.handoff).toMatchObject({
			state: 'available',
		});
	});
	it('AI-026 retains handoffs after chat removal and only detaches provenance', async () => {
		fake.intent = 'handoff';
		allowWorkItem();
		let created: unknown;
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			created = await call(tools, 'create_planning_handoff', handoffArgs(), 'save');
		};
		await run();
		const { handoffId } = (created as { result: { handoffId: string } }).result;
		const before = readHandoff(store, handoffId).versions[0];
		expect(before?.conversationId).toBe(current());
		await chat.remove(current());
		const after = readHandoff(store, handoffId).versions[0];
		expect(after).toMatchObject({
			conversationId: null,
			originMessageId: null,
			originRunId: null,
			content: before?.content,
			markdown: before?.markdown,
		});
		expect(store.db.select().from(conversations).all()).toEqual([]);
	});
	it('AI-018/024 restores chats, transcripts and exact handoff references after reopening storage', async () => {
		fake.intent = 'handoff';
		allowWorkItem();
		fake.execute = async (tools) => {
			await call(tools, 'read_azure_detail', { reference: workItem }, 'read');
			await call(tools, 'create_planning_handoff', handoffArgs(), 'save');
		};
		await run(undefined, 'Durable handoff chat');
		const summaries = chat.conversations();
		const before = transcript();
		await chat.stop();
		store.sqlite.close();
		store = openStore(join(directory, 'test.db'));
		const config = configuration({
			DATABASE_PATH: join(directory, 'test.db'),
			COPILOT_GITHUB_TOKEN: 'synthetic-token-not-real',
		});
		azure = new Azure(store, config);
		chat = new Chat(store, config, azure);
		expect(chat.conversations()).toEqual(summaries);
		expect(transcript()).toEqual(before);
		expect(transcript().find((message) => message.handoff)?.handoff).toMatchObject({
			state: 'available',
			title: 'Synthetic handoff',
		});
	});
});
