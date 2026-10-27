import { z } from 'zod';

/** Assigned work across all types/states; null metadata means unavailable, not a guessed value. */
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

/** Validates the area rules of a team; these rules do not reproduce exact board visibility. */
export const teamBoardSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
	areas: z.array(z.object({ path: z.string().min(1), includeChildren: z.boolean() })),
});

/** PAT user's team-board area scope, including the descendant rule for every area. */
export type TeamBoard = z.infer<typeof teamBoardSchema>;

/** Validates independently cached team metadata, preserving freshness and safe error text. */
export const boardScopeSchema = z.object({
	project: z.string(),
	boards: z.array(teamBoardSchema),
	successAt: z.string().nullable(),
	error: z.string().nullable(),
	stale: z.boolean(),
});

/** Project mapping; a failed refresh may retain boards from the last successful retrieval. */
export type BoardScope = z.infer<typeof boardScopeSchema>;

/** Matches area rules case-insensitively, including children only at backslash boundaries. */
export function matchesBoardArea(areaPath: string, area: TeamBoard['areas'][number]): boolean {
	const path = areaPath.toLowerCase();
	const scope = area.path.toLowerCase();

	return path === scope || (area.includeChildren && path.startsWith(`${scope}\\`));
}

/** Individual or group reviewer; a null vote cannot establish approval. */
export interface Reviewer {
	id: string;
	name: string;
	vote: number | null;
	required: boolean;
	group: boolean;
}

/** Active PR in the server allowlist, with review votes and the reason it is shown. */
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

/** Last-good dataset; errors retain data, and null successAt means never synchronized. */
export interface Snapshot {
	scope: string;
	dataset: 'work' | 'reviews' | 'own';
	data: WorkItem[] | PullRequest[];
	successAt: string | null;
	error: string | null;
	stale: boolean;
}

/** Display metadata for a configured repository; not permission to expand the allowlist. */
export interface Repository {
	id: string;
	project: string;
	name: string;
}

/** Reads work-item snapshots; older cached records normalize missing area metadata to null. */
export const workSchema = z.object({
	id: z.number(),
	title: z.string(),
	project: z.string(),
	type: z.string(),
	state: z.string(),
	priority: z.number().nullable(),
	areaPath: z.string().nullable().default(null),
	url: z.url(),
});

/** Validates normalized cached PRs, not raw Azure DevOps responses. */
export const prViewSchema: z.ZodType<PullRequest> = z.object({
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

/** Validates one persisted dataset and its independently reported freshness/error state. */
export const snapshotSchema: z.ZodType<Snapshot> = z.object({
	scope: z.string(),
	dataset: z.enum(['work', 'reviews', 'own']),
	data: z.union([z.array(workSchema), z.array(prViewSchema)]),
	successAt: z.string().nullable(),
	error: z.string().nullable(),
	stale: z.boolean(),
});

/** Validates repository display identity without changing configured synchronization scope. */
export const repositorySchema: z.ZodType<Repository> = z.object({
	id: z.string(),
	project: z.string(),
	name: z.string(),
});
