import type { DashboardState } from '../lib/contracts';
import { Azure } from './azure';
import { Chat } from './chat';
import { configuration } from './config';
import { AppError, log } from './errors';
import { openStore } from './store';
import { pendingApprovals, readTodos } from './todos';

export function createRuntime() {
	const config = configuration();
	const store = openStore(config.database);
	const azure = new Azure(store, config);
	const chat = new Chat(store, config, azure);
	const state = (): DashboardState => ({
		todos: readTodos(store),
		ado: {
			...config.adoStatus,
			organization: config.ado?.org ?? 'vertigis',
			running: azure.running,
			snapshots: azure.read(),
			repositories: azure.repositories,
			boardScopes: azure.readBoards(),
		},
		copilot: {
			...config.copilotStatus,
			running: chat.running,
			cleanupPending: chat.cleanupPending,
		},
		chat: chat.read(),
		approvals: pendingApprovals(store),
	});
	let stopping: Promise<void> | undefined;
	return {
		config,
		store,
		azure,
		chat,
		state,
		get stopping() {
			return Boolean(stopping);
		},
		stop() {
			stopping ??= (async () => {
				await Promise.all([azure.stop(), chat.stop()]);
				store.sqlite.close();
				log('application.stopped', 'info');
			})();
			return stopping;
		},
	};
}
type Runtime = ReturnType<typeof createRuntime>;
declare global {
	var devdesk: Runtime | undefined;
}

export function startRuntime() {
	if (globalThis.devdesk) return;
	const app = createRuntime();
	globalThis.devdesk = app;
	log('application.started', 'info', {
		ado: app.config.adoStatus.state,
		copilot: app.config.copilotStatus.state,
	});
	if (app.config.ado) void app.azure.refresh();
	const stop = (status: number) => {
		void app
			.stop()
			.then(() => {
				if (process.env.NEXT_MANUAL_SIG_HANDLE) process.exit(status);
			})
			.catch(() => {
				log('application.shutdown_failed', 'error');
				if (process.env.NEXT_MANUAL_SIG_HANDLE) process.exit(1);
			});
	};
	process.once('SIGTERM', () => stop(143));
	process.once('SIGINT', () => stop(130));
}
export function runtime() {
	if (!globalThis.devdesk || globalThis.devdesk.stopping)
		throw new AppError(
			'NOT_READY',
			'The application is not ready. Check storage and migration logs.',
			503,
		);
	return globalThis.devdesk;
}
