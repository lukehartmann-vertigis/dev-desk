import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { openStore, type Store } from './store';
import { approvals, receipts, runs } from './schema';
import { approveDeletion, mutateTodo, readTodos } from './todos';

let directory: string;
let store: Store;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-test-'));
	store = openStore(join(directory, 'test.db'));
});
afterEach(() => {
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});

function create(title = 'A task', requestId = randomUUID()) {
	return mutateTodo(store, { kind: 'create', title, reference: null, requestId });
}

function first() {
	const todo = readTodos(store).items[0];
	if (!todo) {
		throw new Error('Missing test todo');
	}
	return todo;
}

describe('persistent todo contracts', () => {
	it('TODO-001 trims and validates titles before persistence', () => {
		create('  Work  ');
		expect(first().title).toBe('Work');
		create('x'.repeat(500));
		expect(() => create(' ')).toThrow();
		expect(() => create('x'.repeat(501))).toThrow();
		expect(readTodos(store).items).toHaveLength(2);
	});
	it('TODO-011 replays the same receipt and rejects a different payload', () => {
		const id = randomUUID();
		const result = create('Only once', id);
		expect(create('Only once', id)).toEqual(result);
		expect(() => create('Different', id)).toThrow('another operation');
		expect(readTodos(store).items).toHaveLength(1);
		expect(store.db.select().from(receipts).all()[0]?.payload).not.toContain('Only once');
	});
	it('TODO-003/005 complete and reopen preserve identity and append', () => {
		create('First');
		const one = first();
		create('Second');
		mutateTodo(store, {
			kind: 'complete',
			id: one.id,
			revision: 1,
			completed: true,
			requestId: randomUUID(),
		});
		expect(first().completedAt).not.toBeNull();
		mutateTodo(store, {
			kind: 'complete',
			id: one.id,
			revision: 2,
			completed: false,
			requestId: randomUUID(),
		});
		expect(readTodos(store).items.map((todo) => todo.title)).toEqual(['Second', 'First']);
		expect(readTodos(store).items.find((todo) => todo.id === one.id)?.revision).toBe(3);
	});
	it('TODO-006/010 rejects stale updates and leaves the newer title intact', () => {
		create();
		const todo = first();
		mutateTodo(store, {
			kind: 'edit',
			id: todo.id,
			revision: 1,
			title: 'New',
			reference: null,
			requestId: randomUUID(),
		});
		expect(() =>
			mutateTodo(store, {
				kind: 'edit',
				id: todo.id,
				revision: 1,
				title: 'Stale',
				reference: null,
				requestId: randomUUID(),
			}),
		).toThrow('changed');
		expect(first().title).toBe('New');
	});
	it('TODO-003/005 preserves order and completion time when the requested state already holds', () => {
		create('First');
		create('Second');
		const one = first();
		const command = { kind: 'complete' as const, id: one.id, completed: false };
		mutateTodo(store, { ...command, revision: one.revision, requestId: randomUUID() });
		expect(readTodos(store).items.map((todo) => todo.title)).toEqual(['First', 'Second']);
		mutateTodo(store, {
			...command,
			revision: first().revision,
			completed: true,
			requestId: randomUUID(),
		});
		const completedAt = first().completedAt;
		mutateTodo(store, {
			...command,
			revision: first().revision,
			completed: true,
			requestId: randomUUID(),
		});
		expect(first().completedAt).toBe(completedAt);
	});
	it('TODO-008/010 validates the whole open list and its revision', () => {
		create('One');
		create('Two');
		const current = readTodos(store);
		const ids = current.items.map((todo) => todo.id).reverse();
		mutateTodo(store, {
			kind: 'reorder',
			ids,
			listRevision: current.revision,
			requestId: randomUUID(),
		});
		expect(readTodos(store).items.map((todo) => todo.id)).toEqual(ids);
		expect(() =>
			mutateTodo(store, {
				kind: 'reorder',
				ids,
				listRevision: current.revision,
				requestId: randomUUID(),
			}),
		).toThrow('list changed');
		expect(() =>
			mutateTodo(store, {
				kind: 'reorder',
				ids: [first().id, first().id],
				listRevision: readTodos(store).revision,
				requestId: randomUUID(),
			}),
		).toThrow();
	});
	it('TODO-002/OPS-004 preserves acknowledged records across reopen', () => {
		create('Durable');
		const before = first();
		store.sqlite.close();
		store = openStore(join(directory, 'test.db'));
		expect(first()).toEqual(before);
	});
	it('TODO-011 rolls back both mutation and receipt on a storage failure', () => {
		const id = randomUUID();
		store.sqlite.exec(
			"CREATE TEMP TRIGGER reject_insert BEFORE INSERT ON todos BEGIN SELECT RAISE(ABORT, 'test failure'); END",
		);
		expect(() => create('Not committed', id)).toThrow('test failure');
		expect(store.db.select().from(receipts).all()).toEqual([]);
		store.sqlite.exec('DROP TRIGGER reject_insert');
		create('Not committed', id);
		expect(readTodos(store).items).toHaveLength(1);
	});
	it('TODO-009 preserves an unchanged reference when its integration is unavailable', () => {
		const reference = {
			kind: 'workItem' as const,
			organization: 'vertigis',
			project: 'Utilities',
			id: 10,
		};
		mutateTodo(store, { kind: 'create', title: 'Linked', reference, requestId: randomUUID() });
		mutateTodo(
			store,
			{
				kind: 'edit',
				id: first().id,
				revision: 1,
				title: 'Edited offline',
				reference,
				requestId: randomUUID(),
			},
			() => {
				throw new Error('Unavailable');
			},
		);
		expect(first().reference).toEqual(reference);
	});
	it('AI-007 approves only an exact, unexpired version and never reuses an approval', () => {
		create();
		const todo = first();
		const runId = randomUUID();
		const id = randomUUID();
		store.db
			.insert(runs)
			.values({ id: runId, status: 'complete', createdAt: new Date().toISOString() })
			.run();
		store.db
			.insert(approvals)
			.values({
				id,
				todoId: todo.id,
				revision: 1,
				title: todo.title,
				runId,
				expiresAt: new Date(Date.now() + 300000).toISOString(),
			})
			.run();
		mutateTodo(store, {
			kind: 'edit',
			id: todo.id,
			revision: 1,
			title: 'Changed',
			reference: null,
			requestId: randomUUID(),
		});
		expect(() => approveDeletion(store, id, true, randomUUID())).toThrow('changed');
		store.db.update(approvals).set({ revision: 2 }).where(eq(approvals.id, id)).run();
		approveDeletion(store, id, true, randomUUID());
		expect(readTodos(store).items).toEqual([]);
		expect(() => approveDeletion(store, id, true, randomUUID())).toThrow('expired');
	});
	it('AI-007 rejects expired or rejected approvals without deleting', () => {
		create();
		const todo = first();
		const runId = randomUUID();
		const id = randomUUID();
		store.db
			.insert(runs)
			.values({ id: runId, status: 'complete', createdAt: new Date().toISOString() })
			.run();
		store.db
			.insert(approvals)
			.values({
				id,
				todoId: todo.id,
				revision: 1,
				title: todo.title,
				runId,
				expiresAt: new Date(Date.now() - 1).toISOString(),
			})
			.run();
		expect(() => approveDeletion(store, id, true, randomUUID())).toThrow('expired');
		store.db
			.update(approvals)
			.set({ expiresAt: new Date(Date.now() + 300000).toISOString() })
			.where(eq(approvals.id, id))
			.run();
		approveDeletion(store, id, false, randomUUID());
		expect(() => approveDeletion(store, id, true, randomUUID())).toThrow();
		expect(readTodos(store).items).toHaveLength(1);
	});
});
