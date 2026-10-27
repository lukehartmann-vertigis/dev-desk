import { z } from 'zod';
import { referenceSchema, type Reference } from './references';

/** Trims todo titles and rejects empty values or more than 500 characters without truncation. */
export const titleSchema = z
	.string()
	.trim()
	.min(1, 'Enter a title.')
	.max(500, 'Use at most 500 characters.');

/**
 * Commands shared by UI and AI writes. Revisions detect stale edits; request IDs
 * bind retries to an identical payload. Reordering supplies the complete open list.
 */
export const mutationSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('create'),
		requestId: z.string().min(1).max(200),
		title: titleSchema,
		reference: referenceSchema.nullable().default(null),
	}),
	z.object({
		kind: z.literal('edit'),
		requestId: z.string().min(1).max(200),
		id: z.uuid(),
		revision: z.number().int().positive(),
		title: titleSchema,
		reference: referenceSchema.nullable(),
	}),
	z.object({
		kind: z.literal('complete'),
		requestId: z.string().min(1).max(200),
		id: z.uuid(),
		revision: z.number().int().positive(),
		completed: z.boolean(),
	}),
	z.object({
		kind: z.literal('delete'),
		requestId: z.string().min(1).max(200),
		id: z.uuid(),
		revision: z.number().int().positive(),
	}),
	z.object({
		kind: z.literal('reorder'),
		requestId: z.string().min(1).max(200),
		listRevision: z.number().int().nonnegative(),
		ids: z.array(z.uuid()).max(1000),
	}),
]);

/** A normalized command; successful parsing does not imply authorization or a committed write. */
export type Mutation = z.infer<typeof mutationSchema>;

/** Persistent todo with UTC ISO timestamps; no date assignment or automatic expiry. */
export interface Todo {
	id: string;
	title: string;
	/** Optimistic concurrency token for edits, completion, and deletion. */
	revision: number;
	/** Ordering key for the open list; reopening appends the same todo identity. */
	position: number;
	/** Null while open; otherwise the retained completion instant. */
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	reference: Reference | null;
}

/** Complete local list; its revision protects full-list ordering changes. */
export interface TodoList {
	revision: number;
	items: Todo[];
}

/** Validates stored/read todos without applying command-time title normalization. */
export const todoListSchema: z.ZodType<TodoList> = z.object({
	revision: z.number(),
	items: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			revision: z.number(),
			position: z.number(),
			completedAt: z.string().nullable(),
			createdAt: z.string(),
			updatedAt: z.string(),
			reference: referenceSchema.nullable(),
		}),
	),
});
