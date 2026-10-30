'use client';
import { AppShell } from './app-shell';
import { ChatPanel, type ChatProps } from './dashboard/chat-panel';
import { DashboardDialogs } from './dashboard/dashboard-dialogs';
import { DevOpsTabs } from './dashboard/devops-tabs';
import { Modal } from './dashboard/modal';
import { DashboardLegends, legendEntries } from './dashboard/scope-legend';
import { TodoListCard } from './dashboard/todo-list';
import { useDashboard } from './dashboard/use-dashboard';

/** Composes the local workspace; its controller owns writes, polling, retries and chat lifecycle. */
export function Dashboard() {
	const dashboard = useDashboard();
	const {
		state,
		error,
		busy,
		load,
		action,
		setError,
		drawer,
		setDrawer,
		prompt,
		setPrompt,
		streaming,
		streamed,
		send,
		cancel,
		setClearChat,
		setApproval,
	} = dashboard;
	if (!state) {
		return (
			<AppShell active="overview">
				<main className="main-content" aria-label="Workspace content" tabIndex={0}>
					<h1>DevDesk</h1>
					<p role="status">Opening your local workspace...</p>
					{error && (
						<div role="alert" className="notice error">
							<p>{error}</p>
							<button onClick={() => void load()}>Retry</button>
						</div>
					)}
				</main>
			</AppShell>
		);
	}
	const repositories = legendEntries(
		state.ado.repositories.map((repo) => ({ id: repo.id, label: repo.name })),
		'pr',
	);
	const boards = legendEntries(
		state.ado.boardScopes.flatMap((scope) =>
			scope.boards.map((board) => ({
				id: board.id,
				label: `${scope.project} / ${board.name}`,
			})),
		),
		'work',
	);
	const chatProps: ChatProps = {
		state,
		prompt,
		setPrompt,
		streaming,
		streamed,
		send,
		cancel,
		clear: () => setClearChat(true),
		approval: setApproval,
	};
	return (
		<>
			<AppShell
				active="overview"
				sidebar={
					<DashboardLegends state={state} repositories={repositories} boards={boards} />
				}
				chat={<ChatPanel {...chatProps} />}
			>
				<main className="main-content" aria-label="Workspace content" tabIndex={0}>
					<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="eyebrow">YOUR LOCAL WORKSPACE</p>
							<h1>Less noise. More focus.</h1>
							<p>One persistent list. Your work, in context.</p>
						</div>
						<div className="flex flex-wrap gap-2">
							<button className="mobile-chat" onClick={() => setDrawer(true)}>
								Open chat
							</button>
							<button
								disabled={busy || state.ado.state !== 'ready' || state.ado.running}
								onClick={() => void action('refresh', {})}
							>
								{state.ado.running ? 'Refreshing...' : 'Refresh Azure DevOps'}
							</button>
						</div>
					</header>
					{error && (
						<div role="alert" className="notice error mb-5">
							<p>{error}</p>
							<button className="mt-2" onClick={() => setError('')}>
								Dismiss
							</button>
						</div>
					)}
					{state.ado.state !== 'ready' && (
						<div className="notice mb-5">
							<strong>
								Azure DevOps:{' '}
								{state.ado.state === 'disabled'
									? 'not configured'
									: 'configuration error'}
							</strong>
							<p className="mt-1 text-xs">
								{state.ado.message} Local todos remain available.
							</p>
						</div>
					)}
					<TodoListCard
						list={state.todos}
						title={dashboard.title}
						setTitle={dashboard.setTitle}
						busy={busy}
						input={dashboard.input}
						create={dashboard.create}
						mutate={dashboard.mutate}
						edit={dashboard.edit}
						setDeleting={dashboard.setDeleting}
						reorder={dashboard.reorder}
						checkReference={dashboard.checkReference}
						referenceStatus={dashboard.referenceStatus}
					/>
					<DevOpsTabs state={state} repositories={repositories} boards={boards} />
				</main>
			</AppShell>
			{drawer && (
				<Modal title="Copilot chat" drawer close={() => setDrawer(false)}>
					<ChatPanel {...chatProps} />
				</Modal>
			)}
			<DashboardDialogs {...dashboard} />
		</>
	);
}
