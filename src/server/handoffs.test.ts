import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handoffMarkdown, type HandoffContent } from '../lib/contracts/handoffs';
import {
	chatHandoff,
	createHandoffVersion,
	deleteHandoff,
	listHandoffs,
	readHandoff,
	type HandoffCommand,
} from './handoffs';
import { conversations, handoffVersions, messages, runs } from './schema';
import { openStore, type Store } from './store';

let directory: string;
let store: Store;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-handoffs-'));
	store = openStore(join(directory, 'test.db'));
});
afterEach(() => {
	vi.useRealTimers();
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});

const content: HandoffContent = {
	goal: 'Synthetic goal',
	description: '',
	discussion: ['Agreed on option B'],
	acceptanceCriteria: [],
	proposedCriteria: ['Proposed check'],
	constraints: ['No schema change'],
	targetRepository: 'synthetic-repo',
	assumptions: [],
	openQuestions: ['Which API version?'],
	limitations: ['Comments were not available'],
};

function seed(): Omit<HandoffCommand, 'operationId' | 'title'> {
	const conversationId = randomUUID();
	const requestMessageId = randomUUID();
	const runId = randomUUID();
	const now = new Date().toISOString();
	store.db
		.insert(conversations)
		.values({
			id: conversationId,
			title: 'Chat',
			status: 'active',
			createdAt: now,
			updatedAt: now,
		})
		.run();
	store.db
		.insert(messages)
		.values({
			id: requestMessageId,
			conversationId,
			role: 'user',
			content: 'Prepare a handoff',
			status: 'complete',
			createdAt: now,
		})
		.run();
	store.db
		.insert(runs)
		.values({ id: runId, conversationId, requestMessageId, status: 'running', createdAt: now })
		.run();
	return {
		conversationId,
		runId,
		requestMessageId,
		toolName: 'create_planning_handoff',
		reference: { kind: 'workItem', organization: 'vertigis', project: 'Utilities', id: 7 },
		content,
		retrievedAt: '2026-11-03T08:00:00.000Z',
		sourceIncomplete: false,
	};
}

describe('independent handoff artifacts', () => {
	it('AI-015 exports a deterministic self-contained planning request', () => {
		const snapshot = {
			format: 1,
			version: 2,
			title: 'Synthetic',
			reference: {
				kind: 'workItem' as const,
				organization: 'vertigis',
				project: 'Utilities',
				id: 7,
			},
			retrievedAt: '2026-11-03T08:00:00.000Z',
			sourceIncomplete: true,
			createdAt: '2026-11-03T09:00:00.000Z',
			content,
		};
		const markdown = handoffMarkdown(snapshot);
		expect(handoffMarkdown(snapshot)).toBe(markdown);
		for (const text of [
			'# Planning handoff: Synthetic',
			'Planning request only.',
			'untrusted source data',
			'- Source: https://dev.azure.com/vertigis/Utilities/_workitems/edit/7',
			'- Retrieved: 2026-11-03T08:00:00.000Z',
			'- Handoff version: 2',
			"_None found in the work item's acceptance criteria field._",
			'## Proposed acceptance criteria (not from the work item)\n\n- Proposed check',
			'## Target repository\n\nsynthetic-repo',
			'- Retrieved ticket context was truncated or incomplete.\n- Comments were not available',
			'Do not implement until the user explicitly approves the plan',
		]) {
			expect(markdown).toContain(text);
		}
	});
	it('AI-024/025 lists latest versions by activity and keeps earlier versions immutable', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-03T10:00:00.000Z'));
		const first = createHandoffVersion(store, {
			...seed(),
			operationId: 'op-1',
			title: 'First',
		}).result;
		vi.setSystemTime(new Date('2026-11-03T10:01:00.000Z'));
		const other = createHandoffVersion(store, {
			...seed(),
			operationId: 'op-2',
			title: 'Other',
		}).result;
		vi.setSystemTime(new Date('2026-11-03T10:02:00.000Z'));
		const revised = createHandoffVersion(store, {
			...seed(),
			operationId: 'op-3',
			title: 'First revised',
			reviseHandoffId: first.handoffId,
		}).result;
		expect(revised.version).toBe(2);
		expect(
			listHandoffs(store).map((entry) => [entry.id, entry.versionCount, entry.latest.title]),
		).toEqual([
			[first.handoffId, 2, 'First revised'],
			[other.handoffId, 1, 'Other'],
		]);
		const detail = readHandoff(store, first.handoffId);
		expect(detail.versions.map((version) => version.title)).toEqual(['First', 'First revised']);
		expect(chatHandoff(store, first.versionId)).toMatchObject({
			state: 'available',
			version: 1,
			title: 'First',
		});
	});
	it('AI-024 rolls back the version, receipt and chat reference together', () => {
		const command = { ...seed(), operationId: 'op-fail', title: 'Not saved' };
		store.sqlite.exec(
			"CREATE TEMP TRIGGER reject_message BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'test failure'); END",
		);
		expect(() => createHandoffVersion(store, command)).toThrow('test failure');
		store.sqlite.exec('DROP TRIGGER reject_message');
		expect(listHandoffs(store)).toEqual([]);
		expect(store.db.select().from(handoffVersions).all()).toEqual([]);
		expect(createHandoffVersion(store, command).replayed).toBe(false);
	});
	it('AI-026 deletes a handoff only for the confirmed version set and leaves chats intact', () => {
		const command = seed();
		const created = createHandoffVersion(store, {
			...command,
			operationId: 'op-1',
			title: 'A',
		}).result;
		createHandoffVersion(store, {
			...command,
			operationId: 'op-2',
			title: 'A2',
			reviseHandoffId: created.handoffId,
		});
		expect(() => deleteHandoff(store, created.handoffId, 1)).toThrow('changed');
		expect(listHandoffs(store)).toHaveLength(1);
		deleteHandoff(store, created.handoffId, 2);
		expect(listHandoffs(store)).toEqual([]);
		expect(() => readHandoff(store, created.handoffId)).toThrow('no longer available');
		expect(() => deleteHandoff(store, created.handoffId, 2)).toThrow('no longer available');
		const references = store.db
			.select()
			.from(messages)
			.where(eq(messages.conversationId, command.conversationId))
			.all()
			.filter((message) => message.role === 'tool');
		expect(references).toHaveLength(2);
		expect(references.every((message) => message.handoffVersionId === null)).toBe(true);
		expect(chatHandoff(store, null)).toEqual({ state: 'unavailable' });
	});
});
