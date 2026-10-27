import { z } from 'zod';

/** Durable local transcript entry; timestamps are UTC and tool content records committed outcomes. */
export interface ChatMessage {
	id: string;
	runId: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	status: string;
	createdAt: string;
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
	runId: z.string(),
	role: z.enum(['user', 'assistant', 'tool']),
	content: z.string(),
	status: z.string(),
	createdAt: z.string(),
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
