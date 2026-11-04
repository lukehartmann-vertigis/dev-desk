import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openStore } from './store';

const repository = join(process.cwd(), 'drizzle');
let directory: string;
let path: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-migration-'));
	path = join(directory, 'legacy.db');
});
afterEach(() => {
	rmSync(directory, { recursive: true });
});

/** Creates a database at the last single-conversation schema and lets the caller seed it. */
function legacy(seed: (sqlite: Database.Database) => void) {
	const folder = join(directory, 'legacy-migrations');
	mkdirSync(join(folder, 'meta'), { recursive: true });
	const journal = z
		.object({ entries: z.array(z.object({ idx: z.number(), tag: z.string() }).loose()) })
		.loose()
		.parse(JSON.parse(readFileSync(join(repository, 'meta', '_journal.json'), 'utf8')));
	const entries = journal.entries.filter((entry) => entry.idx < 2);
	for (const entry of entries) {
		copyFileSync(join(repository, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
	}
	writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	migrate(drizzle(sqlite), { migrationsFolder: folder });
	seed(sqlite);
	sqlite.close();
}

function seedConversation(sqlite: Database.Database) {
	const insertRun = sqlite.prepare('INSERT INTO runs (id, status, createdAt) VALUES (?, ?, ?)');
	const insertMessage = sqlite.prepare(
		'INSERT INTO messages (id, runId, role, content, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
	);
	insertRun.run('run-1', 'complete', '2026-11-01T10:00:00.000Z');
	insertRun.run('run-2', 'interrupted', '2026-11-01T11:00:00.000Z');
	insertMessage.run(
		'm1',
		'run-1',
		'user',
		'Legacy\nfirst question',
		'complete',
		'2026-11-01T10:00:00.000Z',
	);
	insertMessage.run(
		'm2',
		'run-1',
		'assistant',
		'Legacy answer',
		'complete',
		'2026-11-01T10:00:00.000Z',
	);
	insertMessage.run(
		'm3',
		'run-1',
		'tool',
		'{"tool":"list_todos"}',
		'complete',
		'2026-11-01T10:00:01.000Z',
	);
	insertMessage.run(
		'm4',
		'run-2',
		'user',
		'Second question',
		'complete',
		'2026-11-01T11:00:00.000Z',
	);
	insertMessage.run(
		'm5',
		'run-2',
		'assistant',
		'Run interrupted.',
		'interrupted',
		'2026-11-01T11:00:02.000Z',
	);
	sqlite
		.prepare(
			"INSERT INTO todos (id, title, revision, position, createdAt, updatedAt) VALUES ('t1', 'Kept', 1, 0, '2026-11-01T09:00:00.000Z', '2026-11-01T09:00:00.000Z')",
		)
		.run();
	sqlite
		.prepare(
			"INSERT INTO approvals (id, todoId, revision, title, runId, expiresAt, consumed) VALUES ('a1', 't1', 1, 'Kept', 'run-1', '2026-11-01T10:05:00.000Z', 1)",
		)
		.run();
	sqlite.prepare("INSERT INTO metadata (key, value) VALUES ('sdkSession', 'sdk-legacy')").run();
	sqlite
		.prepare("INSERT INTO metadata (key, value) VALUES ('classifierSession', 'orphan')")
		.run();
}

function snapshot() {
	const store = openStore(path);
	try {
		const all = (query: string) => store.sqlite.prepare(query).all();
		return {
			conversations: all('SELECT * FROM conversations'),
			messages: all(
				'SELECT id, conversationId, runId, role, content, status, createdAt FROM messages ORDER BY createdAt, rowid',
			),
			runs: all(
				'SELECT id, conversationId, requestMessageId, status, createdAt FROM runs ORDER BY rowid',
			),
			approvals: all('SELECT * FROM approvals'),
			todos: all('SELECT id, title FROM todos'),
			metadata: all(
				"SELECT key, value FROM metadata WHERE key <> 'listRevision' ORDER BY key",
			),
		};
	} finally {
		store.sqlite.close();
	}
}

describe('AI-022 single-conversation migration', () => {
	it('adopts the existing transcript as one stable chat without losing order, status or links', () => {
		legacy(seedConversation);
		const migrated = snapshot();
		expect(migrated.conversations).toHaveLength(1);
		const conversation = z
			.object({
				id: z.uuid(),
				title: z.string(),
				status: z.string(),
				sdkSessionId: z.string(),
			})
			.loose()
			.parse(migrated.conversations[0]);
		expect(conversation).toMatchObject({
			title: 'Legacy first question',
			status: 'active',
			sdkSessionId: 'sdk-legacy',
			createdAt: '2026-11-01T10:00:00.000Z',
			updatedAt: '2026-11-01T11:00:02.000Z',
		});
		expect(migrated.messages).toEqual(
			['m1', 'm2', 'm3', 'm4', 'm5'].map((id) =>
				expect.objectContaining({ id, conversationId: conversation.id }),
			),
		);
		expect(migrated.messages[4]).toMatchObject({ runId: 'run-2', status: 'interrupted' });
		expect(migrated.runs).toEqual([
			expect.objectContaining({ id: 'run-1', requestMessageId: 'm1', status: 'complete' }),
			expect.objectContaining({ id: 'run-2', requestMessageId: 'm4', status: 'interrupted' }),
		]);
		expect(migrated.approvals).toEqual([expect.objectContaining({ id: 'a1', runId: 'run-1' })]);
		expect(migrated.todos).toEqual([{ id: 't1', title: 'Kept' }]);
		expect(migrated.metadata).toEqual([{ key: 'classifierSession', value: 'orphan' }]);
		expect(snapshot()).toEqual(migrated);
	});
	it('creates no chat for an empty legacy database', () => {
		legacy(() => {});
		expect(snapshot().conversations).toEqual([]);
	});
	it('keeps an incomplete legacy clear as a removing chat instead of resuming it', () => {
		legacy((sqlite) => {
			seedConversation(sqlite);
			sqlite
				.prepare("INSERT INTO metadata (key, value) VALUES ('cleanupPending', '1')")
				.run();
		});
		expect(snapshot().conversations).toEqual([expect.objectContaining({ status: 'removing' })]);
	});
	it('rolls back completely when the migration fails part-way', () => {
		legacy((sqlite) => {
			seedConversation(sqlite);
			sqlite.prepare('CREATE TABLE handoffs (id text PRIMARY KEY)').run();
		});
		expect(() => openStore(path)).toThrow();
		const sqlite = new Database(path);
		try {
			const tables = sqlite
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
				.all();
			expect(tables).not.toContainEqual({ name: 'conversations' });
			expect(tables).not.toContainEqual({ name: '__legacy_runs' });
			expect(sqlite.prepare('SELECT COUNT(*) AS count FROM messages').get()).toEqual({
				count: 5,
			});
			expect(
				sqlite.prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations').get(),
			).toEqual({ count: 2 });
		} finally {
			sqlite.close();
		}
	});
});
