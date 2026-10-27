import { z } from 'zod';

export const referenceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('workItem'),
		organization: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
		project: z.string().min(1),
		id: z.number().int().positive(),
	}),
	z.object({
		kind: z.literal('pullRequest'),
		organization: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
		project: z.string().min(1),
		repositoryId: z.uuid(),
		id: z.number().int().positive(),
	}),
]);
export type Reference = z.infer<typeof referenceSchema>;
export function referenceUrl(reference: Reference) {
	return `https://dev.azure.com/${encodeURIComponent(reference.organization)}/${encodeURIComponent(reference.project)}/${reference.kind === 'workItem' ? `_workitems/edit/${reference.id}` : `_git/${reference.repositoryId}/pullrequest/${reference.id}`}`;
}
export const titleSchema = z
	.string()
	.trim()
	.min(1, 'Enter a title.')
	.max(500, 'Use at most 500 characters.');
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
export type Mutation = z.infer<typeof mutationSchema>;
export interface Todo {
	id: string;
	title: string;
	revision: number;
	position: number;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
	reference: Reference | null;
}
export interface TodoList {
	revision: number;
	items: Todo[];
}
export interface IntegrationStatus {
	state: 'disabled' | 'configuration_error' | 'ready';
	message: string;
}
export interface WorkItem {
	id: number;
	title: string;
	project: string;
	type: string;
	state: string;
	priority: number | null;
	areaPath: string | null;
	url: string;
}
export const teamBoardSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
	areas: z.array(z.object({ path: z.string().min(1), includeChildren: z.boolean() })),
});
export type TeamBoard = z.infer<typeof teamBoardSchema>;
export const boardScopeSchema = z.object({
	project: z.string(),
	boards: z.array(teamBoardSchema),
	successAt: z.string().nullable(),
	error: z.string().nullable(),
	stale: z.boolean(),
});
export type BoardScope = z.infer<typeof boardScopeSchema>;
/** Matches team area rules case-insensitively, including children only at path boundaries. */
export function matchesBoardArea(areaPath: string, area: TeamBoard['areas'][number]) {
	const path = areaPath.toLowerCase(),
		scope = area.path.toLowerCase();
	return path === scope || (area.includeChildren && path.startsWith(`${scope}\\`));
}
export interface Reviewer {
	id: string;
	name: string;
	vote: number | null;
	required: boolean;
	group: boolean;
}
export interface PullRequest {
	id: number;
	title: string;
	project: string;
	repositoryId: string;
	repository: string;
	author: string;
	draft: boolean;
	url: string;
	reviewers: Reviewer[];
	reason: string;
}
export interface Snapshot {
	scope: string;
	dataset: 'work' | 'reviews' | 'own';
	data: WorkItem[] | PullRequest[];
	successAt: string | null;
	error: string | null;
	stale: boolean;
}
export interface Repository {
	id: string;
	project: string;
	name: string;
}
export interface ChatMessage {
	id: string;
	runId: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	status: string;
	createdAt: string;
}
export interface Approval {
	id: string;
	todoId: string;
	revision: number;
	title: string;
	runId: string;
	expiresAt: string;
}
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

export const workSchema = z.object({
	id: z.number(),
	title: z.string(),
	project: z.string(),
	type: z.string(),
	state: z.string(),
	priority: z.number().nullable(),
	// Older persistent snapshots have no area-path metadata.
	areaPath: z.string().nullable().default(null),
	url: z.url(),
});
const prViewSchema = z.object({
	id: z.number(),
	title: z.string(),
	project: z.string(),
	repositoryId: z.string(),
	repository: z.string(),
	author: z.string(),
	draft: z.boolean(),
	url: z.url(),
	reason: z.string(),
	reviewers: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			vote: z.number().nullable(),
			required: z.boolean(),
			group: z.boolean(),
		}),
	),
});
const integrationSchema = z.object({
	state: z.enum(['disabled', 'configuration_error', 'ready']),
	message: z.string(),
});
export const dashboardSchema: z.ZodType<DashboardState> = z.object({
	todos: z.object({
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
	}),
	ado: integrationSchema.extend({
		organization: z.string(),
		running: z.boolean(),
		repositories: z.array(z.object({ id: z.string(), project: z.string(), name: z.string() })),
		boardScopes: z.array(boardScopeSchema),
		snapshots: z.array(
			z.object({
				scope: z.string(),
				dataset: z.enum(['work', 'reviews', 'own']),
				data: z.union([z.array(workSchema), z.array(prViewSchema)]),
				successAt: z.string().nullable(),
				error: z.string().nullable(),
				stale: z.boolean(),
			}),
		),
	}),
	copilot: integrationSchema.extend({ running: z.boolean(), cleanupPending: z.boolean() }),
	chat: z.array(
		z.object({
			id: z.string(),
			runId: z.string(),
			role: z.enum(['user', 'assistant', 'tool']),
			content: z.string(),
			status: z.string(),
			createdAt: z.string(),
		}),
	),
	approvals: z.array(
		z.object({
			id: z.string(),
			todoId: z.string(),
			revision: z.number(),
			title: z.string(),
			runId: z.string(),
			expiresAt: z.string(),
		}),
	),
});
