import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import type { Reference } from '../lib/contracts';
import type { HandoffContent } from '../lib/contracts/handoffs';
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
/**
 * Durable chat identity owning its transcript, runs, and SDK continuation session.
 * `status` is `active` or `removing`; a removing chat is never resumed and retries cleanup.
 */
export const conversations = sqliteTable('conversations', {
	id: text().primaryKey(),
	title: text().notNull(),
	status: text().notNull(),
	sdkSessionId: text(),
	createdAt: text().notNull(),
	updatedAt: text().notNull(),
});
/** One execution attempt for a stored user message; startup marks unfinished runs interrupted. */
export const runs = sqliteTable(
	'runs',
	{
		id: text().primaryKey(),
		conversationId: text()
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		// Nullable only for migrated legacy runs whose request message cannot be identified.
		requestMessageId: text().references((): AnySQLiteColumn => messages.id, {
			onDelete: 'cascade',
		}),
		status: text().notNull(),
		createdAt: text().notNull(),
	},
	(table) => [index('runs_conversation_idx').on(table.conversationId)],
);
/** Transcript entries owned by their chat; user messages exist independently of any run. */
export const messages = sqliteTable(
	'messages',
	{
		id: text().primaryKey(),
		conversationId: text()
			.notNull()
			.references(() => conversations.id, { onDelete: 'cascade' }),
		runId: text().references(() => runs.id, { onDelete: 'cascade' }),
		role: text().notNull(),
		content: text().notNull(),
		status: text().notNull(),
		createdAt: text().notNull(),
		handoffVersionId: text().references((): AnySQLiteColumn => handoffVersions.id, {
			onDelete: 'set null',
		}),
	},
	(table) => [index('messages_conversation_idx').on(table.conversationId, table.createdAt)],
);
/** Independent planning work product; chat removal never cascades into it. */
export const handoffs = sqliteTable('handoffs', {
	id: text().primaryKey(),
	createdAt: text().notNull(),
	updatedAt: text().notNull(),
});
/** Immutable handoff snapshot; provenance links are detached when their chat is removed. */
export const handoffVersions = sqliteTable(
	'handoff_versions',
	{
		id: text().primaryKey(),
		handoffId: text()
			.notNull()
			.references(() => handoffs.id, { onDelete: 'cascade' }),
		version: integer().notNull(),
		format: integer().notNull(),
		title: text().notNull(),
		reference: text({ mode: 'json' }).$type<Reference>().notNull(),
		content: text({ mode: 'json' }).$type<HandoffContent>().notNull(),
		retrievedAt: text().notNull(),
		sourceIncomplete: integer({ mode: 'boolean' }).notNull(),
		originMessageId: text().references((): AnySQLiteColumn => messages.id, {
			onDelete: 'set null',
		}),
		originRunId: text().references(() => runs.id, { onDelete: 'set null' }),
		createdAt: text().notNull(),
	},
	(table) => [uniqueIndex('handoff_versions_order').on(table.handoffId, table.version)],
);
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
