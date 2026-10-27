import { z } from 'zod';
import {
	boardScopeSchema,
	repositorySchema,
	snapshotSchema,
	type BoardScope,
	type Repository,
	type Snapshot,
} from './azure';
import { approvalSchema, chatMessageSchema, type Approval, type ChatMessage } from './chat';
import { todoListSchema, type TodoList } from './todos';

/** Configuration readiness only; ready does not certify upstream authentication or quota. */
export interface IntegrationStatus {
	state: 'disabled' | 'configuration_error' | 'ready';
	message: string;
}

/** Browser-safe local state, excluding credentials and SDK/provider implementation objects. */
export interface DashboardState {
	todos: TodoList;
	ado: IntegrationStatus & {
		organization: string;
		running: boolean;
		snapshots: Snapshot[];
		repositories: Repository[];
		boardScopes: BoardScope[];
	};
	copilot: IntegrationStatus & { running: boolean; cleanupPending: boolean };
	chat: ChatMessage[];
	approvals: Approval[];
}

const integrationSchema = z.object({
	state: z.enum(['disabled', 'configuration_error', 'ready']),
	message: z.string(),
});

/** Validates full state responses; malformed transport data throws a Zod validation error. */
export const dashboardSchema: z.ZodType<DashboardState> = z.object({
	todos: todoListSchema,
	ado: integrationSchema.extend({
		organization: z.string(),
		running: z.boolean(),
		repositories: z.array(repositorySchema),
		boardScopes: z.array(boardScopeSchema),
		snapshots: z.array(snapshotSchema),
	}),
	copilot: integrationSchema.extend({ running: z.boolean(), cleanupPending: z.boolean() }),
	chat: z.array(chatMessageSchema),
	approvals: z.array(approvalSchema),
});
