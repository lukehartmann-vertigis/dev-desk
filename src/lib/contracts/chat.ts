import { z } from 'zod';
import { chatHandoffSchema, type ChatHandoff } from './handoffs';

/**
 * Durable transcript entry of one conversation; timestamps are UTC.
 * User messages have no run; `handoff` is present only on handoff tool-result messages.
 */
export interface ChatMessage {
	id: string;
	runId: string | null;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	status: string;
	createdAt: string;
	handoff?: ChatHandoff | undefined;
}

/** History entry; `cleanupPending` marks a removal that must be retried and cannot resume. */
export interface ConversationSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	cleanupPending: boolean;
}

/** One-use deletion request bound to an exact todo revision, run, and UTC expiry. */
export interface Approval {
	id: string;
	todoId: string;
	revision: number;
	title: string;
	runId: string;
	expiresAt: string;
}

/** Validates stored transcript entries without interpreting assistant/tool text as markup. */
export const chatMessageSchema: z.ZodType<ChatMessage> = z.object({
	id: z.string(),
	runId: z.string().nullable(),
	role: z.enum(['user', 'assistant', 'tool']),
	content: z.string(),
	status: z.string(),
	createdAt: z.string(),
	handoff: chatHandoffSchema.optional(),
});

/** Validates history entries; ordering is supplied by the server. */
export const conversationSummarySchema: z.ZodType<ConversationSummary> = z.object({
	id: z.string(),
	title: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	cleanupPending: z.boolean(),
});

/** Validates pending approval display data; only the server can consume the approval. */
export const approvalSchema: z.ZodType<Approval> = z.object({
	id: z.string(),
	todoId: z.string(),
	revision: z.number(),
	title: z.string(),
	runId: z.string(),
	expiresAt: z.string(),
});
