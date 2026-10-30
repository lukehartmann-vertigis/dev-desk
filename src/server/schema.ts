import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Reference } from '../lib/contracts';
import type { Source } from '../lib/contracts/settings';

/** Explicit source selection; no row enables nothing and never inherits environment defaults. */
export const azureSettings = sqliteTable('azure_settings', {
	organization: text().primaryKey(),
	revision: integer().notNull(),
	boards: text({ mode: 'json' }).$type<Source[]>().notNull(),
	repositories: text({ mode: 'json' }).$type<Source[]>().notNull(),
});

/** Durable todos; completion retains identity and an optional typed ADO reference. */
export const todos = sqliteTable('todos', {
	id: text().primaryKey(),
	title: text().notNull(),
	revision: integer().notNull(),
	position: integer().notNull(),
	completedAt: text(),
	createdAt: text().notNull(),
	updatedAt: text().notNull(),
	reference: text({ mode: 'json' }).$type<Reference | null>(),
});
/** Local revisions, lifecycle markers, SDK identities, and independently cached team scopes. */
export const metadata = sqliteTable('metadata', {
	key: text().primaryKey(),
	value: text().notNull(),
});
/** Mutation receipts bind a request ID to a payload hash and a minimal committed outcome. */
export const receipts = sqliteTable('receipts', {
	id: text().primaryKey(),
	payload: text().notNull(),
	result: text().notNull(),
});
/** Organization-scoped last-good ADO datasets; failures replace error metadata, not data. */
export const snapshots = sqliteTable('snapshots', {
	scope: text().primaryKey(),
	dataset: text().notNull(),
	data: text().notNull(),
	successAt: text(),
	error: text(),
});
/** Durable chat-run status; startup marks unfinished runs interrupted. */
export const runs = sqliteTable('runs', {
	id: text().primaryKey(),
	status: text().notNull(),
	createdAt: text().notNull(),
});
/** Local transcript and tool outcomes, deleted with their owning run on confirmed clearing. */
export const messages = sqliteTable('messages', {
	id: text().primaryKey(),
	runId: text()
		.notNull()
		.references(() => runs.id, { onDelete: 'cascade' }),
	role: text().notNull(),
	content: text().notNull(),
	status: text().notNull(),
	createdAt: text().notNull(),
});
/** Revision-bound deletion approvals; todo/run removal cascades and consumption is one-use. */
export const approvals = sqliteTable('approvals', {
	id: text().primaryKey(),
	todoId: text()
		.notNull()
		.references(() => todos.id, { onDelete: 'cascade' }),
	revision: integer().notNull(),
	title: text().notNull(),
	runId: text()
		.notNull()
		.references(() => runs.id, { onDelete: 'cascade' }),
	expiresAt: text().notNull(),
	consumed: integer().notNull().default(0),
});
