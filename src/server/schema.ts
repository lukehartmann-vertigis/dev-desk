import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Reference } from '../lib/contracts';

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
export const metadata = sqliteTable('metadata', {
	key: text().primaryKey(),
	value: text().notNull(),
});
export const receipts = sqliteTable('receipts', {
	id: text().primaryKey(),
	payload: text().notNull(),
	result: text().notNull(),
});
export const snapshots = sqliteTable('snapshots', {
	scope: text().primaryKey(),
	dataset: text().notNull(),
	data: text().notNull(),
	successAt: text(),
	error: text(),
});
export const runs = sqliteTable('runs', {
	id: text().primaryKey(),
	status: text().notNull(),
	createdAt: text().notNull(),
});
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
