/**
 * Stable, browser-safe entry point for the application's domain contracts.
 * Implementations are grouped by domain; importing this module never starts services.
 */
export { referenceSchema, referenceUrl, type Reference } from './contracts/references';
export {
	mutationSchema,
	titleSchema,
	type Mutation,
	type Todo,
	type TodoList,
} from './contracts/todos';
export {
	boardScopeSchema,
	matchesBoardArea,
	teamBoardSchema,
	workSchema,
	type BoardScope,
	type PullRequest,
	type Repository,
	type Reviewer,
	type Snapshot,
	type TeamBoard,
	type WorkItem,
} from './contracts/azure';
export { type Approval, type ChatMessage } from './contracts/chat';
export {
	dashboardSchema,
	type DashboardState,
	type IntegrationStatus,
} from './contracts/dashboard';
