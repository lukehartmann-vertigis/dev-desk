'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type FormEvent,
	type ReactNode,
} from 'react';
import { z } from 'zod';
import {
	dashboardSchema,
	matchesBoardArea,
	referenceSchema,
	referenceUrl,
	type Approval,
	type DashboardState,
	type Mutation,
	type PullRequest,
	type Reference,
	type Todo,
	type WorkItem,
} from '../lib/contracts';

type ClientCommand<T> = T extends Mutation ? Omit<T, 'requestId'> : never;
const headers = { 'Content-Type': 'application/json', 'X-Devdesk-Request': '1' };
async function api<T>(path: string, schema: z.ZodType<T>, value?: unknown): Promise<T> {
	const response = await fetch(
		`/api/${path}`,
		value === undefined
			? { cache: 'no-store' }
			: { method: 'POST', headers, body: JSON.stringify(value) },
	);
	const data: unknown = await response.json();
	if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(data).error);
	return schema.parse(data);
}
function time(value: string | null) {
	return value ? new Date(value).toLocaleString() : 'Never synchronized';
}
type LegendEntry = { id: string; label: string; color: string };
const scopeColors = {
	pr: ['#8e9cff', '#67c9aa', '#77bce8', '#c5a1ef', '#78d6d3', '#a8c8ed'],
	work: ['#ffd166', '#dc2626', '#e3ce72', '#ffa870', '#d9ac91', '#f2ce9b'],
};
function legendEntries(
	entries: { id: string; label: string }[],
	kind: 'pr' | 'work',
): LegendEntry[] {
	return [...entries]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((entry, index) => ({
			...entry,
			color:
				scopeColors[kind][index] ??
				`hsl(${kind === 'work' ? 5 + ((index * 137.508) % 60) : 155 + ((index * 137.508) % 125)} 65% 72%)`,
		}));
}
function ScopeLabel({ entry }: { entry: LegendEntry }) {
	return (
		<span className="scope-label" data-scope-id={entry.id}>
			<span
				className="legend-dot"
				style={{ backgroundColor: entry.color }}
				aria-hidden="true"
			/>
			<span>{entry.label}</span>
		</span>
	);
}
function SafeText({ text, state }: { text: string; state: DashboardState }) {
	const allowed = new Set([
		...state.todos.items.flatMap((todo) =>
			todo.reference ? [referenceUrl(todo.reference)] : [],
		),
		...state.ado.snapshots.flatMap((scope) => scope.data.map((row) => row.url)),
	]);
	return (
		<>
			{text.split(/(https:\/\/dev\.azure\.com\/[^\s<>"'`]+)/g).map((part, index) =>
				allowed.has(part) ? (
					<a key={index} href={part} target="_blank" rel="noopener noreferrer">
						{part}
					</a>
				) : (
					part
				),
			)}
		</>
	);
}
function Modal({
	title,
	children,
	close,
	busy = false,
	drawer = false,
}: {
	title: string;
	children: ReactNode;
	close: () => void;
	busy?: boolean;
	drawer?: boolean;
}) {
	const ref = useRef<HTMLDialogElement>(null),
		id = useId();
	useEffect(() => {
		const element = ref.current,
			trigger = document.activeElement;
		element?.showModal();
		return () => {
			element?.close();
			if (trigger instanceof HTMLElement) trigger.focus();
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby={id}
			className={drawer ? 'modal drawer' : 'modal'}
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) close();
			}}
		>
			<div className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-5">
				<h2 id={id}>{title}</h2>
				<button type="button" onClick={close} disabled={busy} aria-label={`Close ${title}`}>
					Close
				</button>
			</div>
			{children}
		</dialog>
	);
}
type ChatProps = {
	state: DashboardState;
	prompt: string;
	setPrompt: (value: string) => void;
	streaming: boolean;
	streamed: string;
	send: (event: FormEvent) => void;
	cancel: () => void;
	clear: () => void;
	approval: (approval: Approval) => void;
};
function ChatPanel({
	state,
	prompt,
	setPrompt,
	streaming,
	streamed,
	send,
	cancel,
	clear,
	approval,
}: ChatProps) {
	const end = useRef<HTMLDivElement>(null),
		keyboardHint = useId(),
		canSend =
			Boolean(prompt.trim()) &&
			!streaming &&
			!state.copilot.running &&
			state.copilot.state === 'ready' &&
			!state.copilot.cleanupPending;
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [state.chat.length, streamed]);
	return (
		<div className="chat-panel">
			<header className="flex items-center justify-between gap-2 border-b border-[var(--line)] p-5">
				<div>
					<h2>Copilot assistant</h2>
					<p className="text-xs">
						{state.copilot.running || streaming
							? 'Working...'
							: state.copilot.state === 'ready'
								? 'Configured'
								: 'Not configured'}
					</p>
				</div>
				<button
					type="button"
					onClick={clear}
					className="text-xs"
					disabled={!state.chat.length && !state.copilot.cleanupPending}
				>
					Clear
				</button>
			</header>
			<div className="messages" role="log" aria-label="Conversation">
				{state.copilot.state !== 'ready' && (
					<p className="notice">{state.copilot.message}</p>
				)}
				{state.copilot.cleanupPending && (
					<p className="notice error">
						Cleanup is incomplete. Use Clear to retry; new runs are blocked.
					</p>
				)}
				{!state.chat.length && (
					<div className="py-8">
						<h3>A little less context switching.</h3>
						<p className="mt-2 text-sm">
							Ask about your work, summarize a PR, or tell me to create a todo.
						</p>
					</div>
				)}
				{state.chat.map((message) => (
					<article key={message.id} className={`bubble ${message.role}`}>
						<div className="mb-2 flex flex-wrap justify-between gap-2 text-[10px] font-bold tracking-wider uppercase">
							<span>{message.role === 'tool' ? 'Tool outcome' : message.role}</span>
							<span>{message.status}</span>
						</div>
						{message.role === 'tool' ? (
							<details>
								<summary>Show committed result / error</summary>
								<pre className="mt-2 text-xs break-all whitespace-pre-wrap">
									{message.content}
								</pre>
							</details>
						) : (
							<div className="break-words whitespace-pre-wrap">
								<SafeText
									text={
										message.status === 'running' && message.role === 'assistant'
											? streamed || message.content || 'Thinking...'
											: message.content
									}
									state={state}
								/>
							</div>
						)}
						<time
							className="mt-2 block text-[10px] text-[var(--muted)]"
							dateTime={message.createdAt}
						>
							{time(message.createdAt)}
						</time>
					</article>
				))}
				{state.approvals.map((item) => (
					<div className="notice" key={item.id}>
						<strong>Deletion approval needed</strong>
						<p className="my-2 break-words">{item.title}</p>
						<p className="mb-3 text-xs">
							Expires {time(item.expiresAt)}. No deletion has occurred.
						</p>
						<button onClick={() => approval(item)}>Review deletion</button>
					</div>
				))}
				<div ref={end} />
			</div>
			<form onSubmit={send} className="border-t border-[var(--line)] p-4">
				<textarea
					aria-label="Message to Copilot"
					aria-describedby={keyboardHint}
					placeholder="Ask about your work..."
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						if (
							event.key === 'Enter' &&
							!event.shiftKey &&
							!event.nativeEvent.isComposing &&
							event.nativeEvent.keyCode !== 229
						) {
							event.preventDefault();
							if (canSend && !event.repeat) event.currentTarget.form?.requestSubmit();
						}
					}}
					maxLength={8000}
					rows={3}
					disabled={streaming || state.copilot.running || state.copilot.state !== 'ready'}
				/>
				<p id={keyboardHint} className="mt-1 text-[10px]">
					Enter to send. Shift+Enter for a new line.
				</p>
				<div className="mt-2 flex justify-end gap-2">
					{streaming || state.copilot.running ? (
						<button type="button" onClick={cancel}>
							Cancel run
						</button>
					) : (
						<button className="primary" disabled={!canSend}>
							Send
						</button>
					)}
				</div>
				<p className="mt-3 text-[10px] leading-relaxed">
					On request, selected todo and Azure DevOps content is sent to GitHub Copilot
					under your account policies. Suggestions do not execute themselves. Deletion
					always needs separate approval.
				</p>
			</form>
		</div>
	);
}

export function Dashboard() {
	const [state, setState] = useState<DashboardState | null>(null);
	const [error, setError] = useState(''),
		[busy, setBusy] = useState(false);
	const [title, setTitle] = useState(''),
		[prompt, setPrompt] = useState('');
	const [streaming, setStreaming] = useState(false),
		[streamed, setStreamed] = useState('');
	const [drawer, setDrawer] = useState(false);
	const [editing, setEditing] = useState<Todo | null>(null),
		[deleting, setDeleting] = useState<Todo | null>(null);
	const [editTitle, setEditTitle] = useState(''),
		[editLink, setEditLink] = useState('');
	const [clearChat, setClearChat] = useState(false),
		[approval, setApproval] = useState<Approval | null>(null);
	const [dragId, setDragId] = useState<string | null>(null);
	const [referenceStatus, setReferenceStatus] = useState<Record<string, string>>({});
	const requests = useRef(new Map<string, string>()),
		actionPending = useRef(false),
		abort = useRef<AbortController | null>(null),
		input = useRef<HTMLInputElement>(null);
	const reduceMotion = useReducedMotion();
	const load = useCallback(async () => {
		try {
			setState(await api('state', dashboardSchema));
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Could not load the workspace.');
		}
	}, []);
	useEffect(() => {
		let mounted = true;
		void api('state', dashboardSchema)
			.then((value) => {
				if (mounted) setState(value);
			})
			.catch((failure: unknown) => {
				if (mounted)
					setError(
						failure instanceof Error
							? failure.message
							: 'Could not load the workspace.',
					);
			});
		const timer = setInterval(() => {
			if (!document.hidden) void load();
		}, 15000);
		const focus = () => {
			if (!document.hidden) void load();
		};
		document.addEventListener('visibilitychange', focus);
		window.addEventListener('focus', focus);
		const leave = () => {
			if (!abort.current) return;
			abort.current.abort();
			void fetch('/api/chat/cancel', {
				method: 'POST',
				headers,
				body: '{}',
				keepalive: true,
			}).catch(() =>
				console.error(
					'Could not deliver chat cancellation. The server run deadline remains active.',
				),
			);
		};
		window.addEventListener('pagehide', leave);
		return () => {
			mounted = false;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', focus);
			window.removeEventListener('focus', focus);
			window.removeEventListener('pagehide', leave);
			leave();
		};
	}, [load]);
	useEffect(() => {
		if (!state?.copilot.running && !state?.ado.running && !streaming) return;
		const timer = setInterval(() => {
			if (!document.hidden) void load();
		}, 1000);
		return () => clearInterval(timer);
	}, [state?.copilot.running, state?.ado.running, streaming, load]);
	async function action(path: string, value: unknown) {
		if (actionPending.current) return false;
		actionPending.current = true;
		setBusy(true);
		setError('');
		try {
			setState(await api(path, dashboardSchema, value));
			return true;
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'The operation failed.');
			await load();
			return false;
		} finally {
			actionPending.current = false;
			setBusy(false);
		}
	}
	async function mutate(command: ClientCommand<Mutation>) {
		const key = JSON.stringify(command),
			requestId = requests.current.get(key) ?? crypto.randomUUID();
		requests.current.set(key, requestId);
		const ok = await action('todos', { ...command, requestId });
		if (ok) requests.current.delete(key);
		return ok;
	}
	async function create(event: FormEvent) {
		event.preventDefault();
		if (busy) return;
		if (await mutate({ kind: 'create', title: title.trim(), reference: null })) {
			setTitle('');
			input.current?.focus();
		}
	}
	async function saveEdit(event: FormEvent) {
		event.preventDefault();
		if (!editing || !state || busy) return;
		let reference = editing.reference;
		const previous = reference ? referenceUrl(reference) : '';
		try {
			if (editLink.trim() !== previous)
				reference = editLink.trim()
					? (
							await api('reference', z.object({ reference: referenceSchema }), {
								url: editLink.trim(),
							})
						).reference
					: null;
			if (
				await mutate({
					kind: 'edit',
					id: editing.id,
					revision: editing.revision,
					title: editTitle.trim(),
					reference,
				})
			)
				setEditing(null);
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Invalid reference.');
		}
	}
	function edit(todo: Todo) {
		setEditing(todo);
		setEditTitle(todo.title);
		setEditLink(todo.reference ? referenceUrl(todo.reference) : '');
	}
	async function reorder(id: string, target: number) {
		if (!state || busy) return;
		const ids = state.todos.items.filter((todo) => !todo.completedAt).map((todo) => todo.id);
		const index = ids.indexOf(id);
		if (index < 0 || target < 0 || target >= ids.length || index === target) return;
		ids.splice(index, 1);
		ids.splice(target, 0, id);
		await mutate({ kind: 'reorder', listRevision: state.todos.revision, ids });
	}
	async function send(event: FormEvent) {
		event.preventDefault();
		if (
			abort.current ||
			streaming ||
			state?.copilot.state !== 'ready' ||
			state.copilot.running ||
			state.copilot.cleanupPending ||
			!prompt.trim()
		)
			return;
		setError('');
		setStreaming(true);
		setStreamed('');
		const controller = new AbortController();
		abort.current = controller;
		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers,
				body: JSON.stringify({ prompt, requestId: crypto.randomUUID() }),
				signal: controller.signal,
			});
			if (!response.ok)
				throw new Error(z.object({ error: z.string() }).parse(await response.json()).error);
			setPrompt('');
			await load();
			const reader = response.body?.getReader();
			if (!reader) throw new Error('The response stream is unavailable.');
			const decoder = new TextDecoder();
			let buffer = '',
				finished = false;
			for (;;) {
				const part = await reader.read();
				if (part.done) {
					if (!finished)
						throw new Error(
							'The response stream ended before completion. Stored results remain available.',
						);
					break;
				}
				buffer += decoder.decode(part.value, { stream: true });
				let newline: number;
				while ((newline = buffer.indexOf('\n')) >= 0) {
					const value = z
						.object({
							type: z.string(),
							text: z.string().optional(),
							message: z.string().optional(),
						})
						.parse(JSON.parse(buffer.slice(0, newline)));
					buffer = buffer.slice(newline + 1);
					if (value.text !== undefined) setStreamed(value.text);
					if (value.type === 'complete' || value.type === 'error') finished = true;
					if (value.type === 'error')
						setError(value.message ?? 'The assistant run failed.');
				}
			}
		} catch (failure) {
			setError(
				controller.signal.aborted
					? 'Run cancelled. Committed changes remain saved.'
					: failure instanceof Error
						? failure.message
						: 'The chat stream failed.',
			);
		} finally {
			abort.current = null;
			setStreaming(false);
			await load();
		}
	}
	function cancel() {
		abort.current?.abort();
		void action('chat/cancel', {});
	}
	async function checkReference(reference: Reference) {
		const key = JSON.stringify(reference);
		setReferenceStatus((old) => ({ ...old, [key]: 'Checking...' }));
		try {
			const result = await api(
				'reference/check',
				z.object({ checkedAt: z.string() }),
				reference,
			);
			setReferenceStatus((old) => ({ ...old, [key]: `Verified ${time(result.checkedAt)}` }));
		} catch (failure) {
			setReferenceStatus((old) => ({
				...old,
				[key]: `Unavailable: ${failure instanceof Error ? failure.message : 'Reference check failed.'}`,
			}));
		}
	}
	if (!state)
		return (
			<main className="mx-auto max-w-2xl p-8">
				<h1>DevDesk</h1>
				<p role="status">Opening your local workspace...</p>
				{error && (
					<div role="alert" className="notice error">
						<p>{error}</p>
						<button onClick={() => void load()}>Retry</button>
					</div>
				)}
			</main>
		);
	const open = state.todos.items.filter((todo) => !todo.completedAt);
	const completed = state.todos.items
		.filter((todo) => todo.completedAt)
		.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
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
	const renderTodo = (todo: Todo, index: number) => (
		<motion.li
			key={todo.id}
			initial={false}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: reduceMotion ? 0 : 0.12 }}
			className="todo-row"
			draggable={!todo.completedAt && !busy}
			onDragStart={() => setDragId(todo.id)}
			onDragEnd={() => setDragId(null)}
			onDragOver={(event) => {
				if (!todo.completedAt) event.preventDefault();
			}}
			onDrop={(event) => {
				event.preventDefault();
				if (dragId) void reorder(dragId, index);
				setDragId(null);
			}}
		>
			<input
				type="checkbox"
				aria-label={`${todo.completedAt ? 'Reopen' : 'Complete'} ${todo.title}`}
				checked={Boolean(todo.completedAt)}
				disabled={busy}
				onChange={() =>
					void mutate({
						kind: 'complete',
						id: todo.id,
						revision: todo.revision,
						completed: !todo.completedAt,
					})
				}
			/>
			<div className="min-w-0 flex-1">
				<span className={todo.completedAt ? 'text-[var(--muted)] line-through' : ''}>
					{todo.title}
				</span>
				{todo.reference && (
					<div className="mt-1 text-xs">
						<a
							href={referenceUrl(todo.reference)}
							target="_blank"
							rel="noopener noreferrer"
						>
							{todo.reference.kind === 'workItem' ? 'Work item' : 'PR'} #
							{todo.reference.id}
						</a>
						<span className="ml-2 text-[var(--muted)]">
							{referenceStatus[JSON.stringify(todo.reference)] ??
								'Unverified reference'}
						</span>
						<button
							type="button"
							className="ml-2 px-2 py-1 text-[10px]"
							disabled={
								referenceStatus[JSON.stringify(todo.reference)] === 'Checking...'
							}
							onClick={() => {
								if (todo.reference) void checkReference(todo.reference);
							}}
						>
							Check reference
						</button>
					</div>
				)}
				{todo.completedAt && (
					<time
						className="mt-1 block text-[10px] text-[var(--muted)]"
						dateTime={todo.completedAt}
					>
						{time(todo.completedAt)}
					</time>
				)}
			</div>
			<div className="todo-actions">
				{!todo.completedAt && (
					<>
						<button
							title="Move up"
							aria-label={`Move ${todo.title} up`}
							disabled={busy || index === 0}
							onClick={() => void reorder(todo.id, index - 1)}
						>
							Up
						</button>
						<button
							title="Move down"
							aria-label={`Move ${todo.title} down`}
							disabled={busy || index === open.length - 1}
							onClick={() => void reorder(todo.id, index + 1)}
						>
							Down
						</button>
					</>
				)}
				<button
					disabled={busy}
					onClick={() => edit(todo)}
					aria-label={`Edit ${todo.title}`}
				>
					Edit
				</button>
				<button
					disabled={busy}
					className="danger"
					onClick={() => setDeleting(todo)}
					aria-label={`Delete ${todo.title}`}
				>
					Delete
				</button>
			</div>
		</motion.li>
	);
	return (
		<div className="app-shell">
			<aside className="sidebar">
				<Link className="brand" href="/">
					<span className="logo">D</span> DevDesk
				</Link>
				<p className="eyebrow mt-8">Workspace</p>
				<div className="nav-item">Overview</div>
				<div className="scope-legends">
					<section aria-label="PR repository legend">
						<h2 className="eyebrow">PR repositories</h2>
						<ul className="space-y-2">
							{repositories.map((entry) => (
								<li key={entry.id}>
									<ScopeLabel entry={entry} />
								</li>
							))}
						</ul>
					</section>
					<section aria-label="Team board legend">
						<h2 className="eyebrow">My team boards</h2>
						<ul className="space-y-2">
							{boards.map((entry) => (
								<li key={entry.id}>
									<ScopeLabel entry={entry} />
								</li>
							))}
						</ul>
						{!boards.length && (
							<p className="text-xs">
								{state.ado.boardScopes.some((scope) => scope.error)
									? 'Team board mapping unavailable.'
									: state.ado.boardScopes.some(
												(scope) => scope.successAt && !scope.stale,
										  )
										? 'No team boards in your memberships.'
										: 'Team boards not synchronized yet.'}
							</p>
						)}
						<p className="mt-3 text-[10px]">
							Area-path scopes, not board columns. Multiple matches are shown.
						</p>
					</section>
				</div>
				<p className="mt-8 text-xs">
					Local workspace
					<br />
					Stored on your machine
				</p>
			</aside>
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
				<section className="card" aria-labelledby="todos-title">
					<header className="card-header">
						<h2 id="todos-title">Your todos</h2>
						<span className="badge">{open.length} open</span>
					</header>
					<form onSubmit={create} className="flex gap-2 px-5 pb-5">
						<input
							ref={input}
							aria-label="New todo"
							placeholder="Add a task and press Enter..."
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key === 'Enter' &&
									(event.nativeEvent.isComposing ||
										event.nativeEvent.keyCode === 229 ||
										event.repeat)
								)
									event.preventDefault();
							}}
							required
							readOnly={busy}
							className="min-w-0 flex-1"
						/>
						<button className="primary" disabled={busy || !title.trim()}>
							Add
						</button>
					</form>
					<ul>
						<AnimatePresence initial={false}>{open.map(renderTodo)}</AnimatePresence>
					</ul>
					{!open.length && (
						<p className="empty">Nothing on your list. Add your first todo above.</p>
					)}
					<details className="completed">
						<summary>Completed ({completed.length})</summary>
						<ul>{completed.map(renderTodo)}</ul>
					</details>
					<footer className="card-footer">
						Saved locally. No rollover, no automatic expiry.
					</footer>
				</section>
				<DevOpsTabs state={state} repositories={repositories} boards={boards} />
			</main>
			<aside className="desktop-chat">
				<ChatPanel {...chatProps} />
			</aside>
			{drawer && (
				<Modal title="Copilot chat" drawer close={() => setDrawer(false)}>
					<ChatPanel {...chatProps} />
				</Modal>
			)}
			{editing && (
				<Modal title="Edit todo" close={() => setEditing(null)} busy={busy}>
					<form onSubmit={saveEdit} className="space-y-4 p-5">
						<label className="block">
							Title
							<input
								aria-label="Todo title"
								value={editTitle}
								onChange={(event) => setEditTitle(event.target.value)}
								required
								disabled={busy}
								className="mt-2 w-full"
							/>
						</label>
						<label className="block">
							External reference (optional)
							<input
								aria-label="External reference"
								type="url"
								value={editLink}
								onChange={(event) => setEditLink(event.target.value)}
								placeholder="https://dev.azure.com/..."
								className="mt-2 w-full"
							/>
						</label>
						<p className="text-xs">
							Only configured Azure DevOps projects/repositories are allowed.
							References are labelled unverified until checked upstream.
						</p>
						<div className="flex justify-end gap-2">
							<button type="button" onClick={() => setEditing(null)} disabled={busy}>
								Cancel
							</button>
							<button className="primary" disabled={busy}>
								Save
							</button>
						</div>
					</form>
				</Modal>
			)}
			{deleting && (
				<Modal title="Delete todo?" close={() => setDeleting(null)} busy={busy}>
					<div className="p-5">
						<p className="break-words">
							Permanently delete &quot;{deleting.title}&quot;?
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setDeleting(null)}>
								Cancel
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (
										await mutate({
											kind: 'delete',
											id: deleting.id,
											revision: deleting.revision,
										})
									)
										setDeleting(null);
								}}
							>
								Delete permanently
							</button>
						</div>
					</div>
				</Modal>
			)}
			{approval && (
				<Modal
					title="Confirm assistant deletion"
					close={() => setApproval(null)}
					busy={busy}
				>
					<div className="p-5">
						<p className="break-words">
							Delete &quot;{approval.title}&quot; at revision {approval.revision}?
						</p>
						<p className="mt-2 text-xs">
							This approval applies to this exact todo version and expires{' '}
							{time(approval.expiresAt)}.
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button
								disabled={busy}
								onClick={async () => {
									if (
										await action('approval', {
											id: approval.id,
											accept: false,
											requestId: crypto.randomUUID(),
										})
									)
										setApproval(null);
								}}
							>
								Reject
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (
										await action('approval', {
											id: approval.id,
											accept: true,
											requestId: crypto.randomUUID(),
										})
									)
										setApproval(null);
								}}
							>
								Confirm deletion
							</button>
						</div>
					</div>
				</Modal>
			)}
			{clearChat && (
				<Modal title="Clear conversation?" close={() => setClearChat(false)} busy={busy}>
					<div className="p-5">
						<p>
							This cancels active work and removes local messages, tool outcomes,
							approvals, and SDK conversation state. Todos remain saved.
						</p>
						<p className="mt-3 text-xs">
							Old backups and GitHub retention are not affected. Incomplete cleanup is
							reported and can be retried.
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setClearChat(false)}>
								Cancel
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (await action('chat/clear', { confirmed: true }))
										setClearChat(false);
								}}
							>
								Clear conversation
							</button>
						</div>
					</div>
				</Modal>
			)}
		</div>
	);
}

const devOpsTabs = [
	{ dataset: 'work', label: 'Assigned work items' },
	{ dataset: 'reviews', label: 'Review requests' },
	{ dataset: 'own', label: 'Your pull requests' },
] as const;
type DevOpsDataset = (typeof devOpsTabs)[number]['dataset'];
type DevOpsProps = {
	state: DashboardState;
	repositories: LegendEntry[];
	boards: LegendEntry[];
};
function DevOpsTabs({ state, repositories, boards }: DevOpsProps) {
	const [active, setActive] = useState<DevOpsDataset>('work'),
		id = useId(),
		buttons = useRef(new Map<DevOpsDataset, HTMLButtonElement>());
	return (
		<section className="card" aria-label="Azure DevOps">
			<div className="devops-tabs" role="tablist" aria-label="Azure DevOps views">
				{devOpsTabs.map(({ dataset, label }, index) => {
					const scopes = state.ado.snapshots.filter((scope) => scope.dataset === dataset),
						count = scopes.reduce((total, scope) => total + scope.data.length, 0),
						stale =
							scopes.some((scope) => scope.stale) ||
							(dataset === 'work' &&
								state.ado.boardScopes.some((scope) => scope.stale));
					return (
						<button
							key={dataset}
							ref={(element) => {
								if (element) buttons.current.set(dataset, element);
								else buttons.current.delete(dataset);
							}}
							type="button"
							role="tab"
							id={`${id}-tab-${dataset}`}
							aria-controls={`${id}-panel-${dataset}`}
							aria-selected={active === dataset}
							tabIndex={active === dataset ? 0 : -1}
							className="devops-tab"
							data-dataset={dataset}
							onClick={() => setActive(dataset)}
							onKeyDown={(event) => {
								const target =
									event.key === 'ArrowRight'
										? (index + 1) % devOpsTabs.length
										: event.key === 'ArrowLeft'
											? (index + devOpsTabs.length - 1) % devOpsTabs.length
											: event.key === 'Home'
												? 0
												: event.key === 'End'
													? devOpsTabs.length - 1
													: null;
								if (target === null) return;
								event.preventDefault();
								const tab = devOpsTabs[target];
								if (tab) {
									setActive(tab.dataset);
									buttons.current.get(tab.dataset)?.focus();
								}
							}}
						>
							<span>
								{label}
								{stale && (
									<span className="tab-warning" title="Stale or incomplete data">
										<span aria-hidden="true"> !</span>
										<span className="sr-only"> Stale or incomplete data</span>
									</span>
								)}
							</span>
							<span className="badge tab-count">
								{count}
								<span className="sr-only">{count === 1 ? ' item' : ' items'}</span>
							</span>
						</button>
					);
				})}
			</div>
			{devOpsTabs.map(({ dataset }) => (
				<div
					key={dataset}
					role="tabpanel"
					id={`${id}-panel-${dataset}`}
					aria-labelledby={`${id}-tab-${dataset}`}
					hidden={active !== dataset}
					tabIndex={0}
				>
					{active === dataset && (
						<DevOpsPanel
							dataset={dataset}
							state={state}
							repositories={repositories}
							boards={boards}
						/>
					)}
				</div>
			))}
		</section>
	);
}
function DevOpsPanel({
	dataset,
	state,
	repositories,
	boards,
}: DevOpsProps & { dataset: DevOpsDataset }) {
	const scopes = state.ado.snapshots.filter((scope) => scope.dataset === dataset);
	const rows = scopes.flatMap<WorkItem | PullRequest>((scope) => scope.data);
	return (
		<div className="devops-panel-content">
			{scopes.some((scope) => scope.stale) && (
				<p className="px-5 pb-3 text-xs text-amber-200">
					Stale or incomplete: showing last successfully saved data where available.
				</p>
			)}
			{scopes
				.filter((scope) => scope.error)
				.map((scope) => (
					<p key={scope.scope} className="notice error mx-4 text-xs">
						{scope.scope}: {scope.error}
					</p>
				))}
			{dataset === 'work' &&
				state.ado.boardScopes.map((scope) => (
					<div key={scope.project} className="px-5 pb-3 text-xs">
						{scope.error ? (
							<p className="notice error">
								Board mapping for {scope.project}: {scope.error}
							</p>
						) : scope.stale ? (
							<p className="text-amber-200">
								Board mapping for {scope.project}:{' '}
								{scope.successAt ? 'stale team scopes.' : 'not synchronized yet.'}
							</p>
						) : null}
						<p>
							Team scopes: {scope.project} / {time(scope.successAt)}
						</p>
					</div>
				))}
			{!rows.length && (
				<p className="empty">
					{state.ado.state !== 'ready'
						? 'Integration is not available.'
						: !scopes.length || scopes.every((scope) => !scope.successAt)
							? 'Not synchronized yet.'
							: 'No matching items in the successfully synchronized scopes.'}
				</p>
			)}
			{rows.map((row) => {
				const areaPath = 'areaPath' in row ? row.areaPath : null;
				const boardScope = state.ado.boardScopes.find(
					(scope) => scope.project.toLowerCase() === row.project.toLowerCase(),
				);
				const boardIds = !areaPath
					? []
					: (boardScope?.boards
							.filter((board) =>
								board.areas.some((area) => matchesBoardArea(areaPath, area)),
							)
							.map((board) => board.id) ?? []);
				const markers =
					'repositoryId' in row
						? repositories.filter((entry) => entry.id === row.repositoryId)
						: boards.filter((entry) => boardIds.includes(entry.id));
				return (
					<article
						className="work-row"
						key={`${row.project}:${'repositoryId' in row ? row.repositoryId : 'work'}:${row.id}`}
					>
						<div className="work-marker" aria-hidden="true">
							{markers.map((entry) => (
								<span key={entry.id} style={{ backgroundColor: entry.color }} />
							))}
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
								{markers.map((entry) => (
									<ScopeLabel key={entry.id} entry={entry} />
								))}
							</div>
							<a
								className="font-medium"
								href={row.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								{'repositoryId' in row ? 'PR' : '#'}
								{row.id} {row.title}
							</a>
							{'repositoryId' in row ? (
								<PrMeta row={row} />
							) : (
								<>
									<p className="mt-1 text-xs">
										{row.project} / {row.type} / {row.state} / Priority{' '}
										{row.priority ?? 'unavailable'}
									</p>
									<p className="mt-1 text-xs">
										{row.areaPath ?? 'Area path unavailable'}
										{!row.areaPath || !boardScope?.successAt
											? ' / Board mapping unavailable'
											: boardScope.stale
												? ' / Board mapping stale'
												: !markers.length
													? ' / No matching team board'
													: ''}
									</p>
								</>
							)}
						</div>
					</article>
				);
			})}
			<footer className="card-footer">
				{!scopes.length
					? 'Never synchronized'
					: scopes.map((scope) => (
							<div key={scope.scope} className="break-words">
								{scope.scope}: {time(scope.successAt)}
							</div>
						))}
			</footer>
		</div>
	);
}
function PrMeta({ row }: { row: PullRequest }) {
	const votes = new Map([
		[10, 'Approved'],
		[5, 'Approved with suggestions'],
		[0, 'No vote'],
		[-5, 'Waiting for author'],
		[-10, 'Rejected'],
	]);
	return (
		<>
			<p className="mt-1 text-xs">
				{row.project} / {row.repository} / {row.author}
				{row.draft ? ' / Draft' : ''} / {row.reason}
			</p>
			<details className="mt-2 text-xs">
				<summary>Review votes ({row.reviewers.length})</summary>
				{row.reviewers.map((reviewer) => (
					<p key={reviewer.id} className="mt-1">
						{reviewer.name}
						{reviewer.group ? ' (group)' : ''}
						{reviewer.required ? ' (required)' : ''}:{' '}
						{reviewer.vote === null
							? 'Vote unavailable'
							: (votes.get(reviewer.vote) ?? `Vote ${reviewer.vote}`)}
					</p>
				))}
			</details>
		</>
	);
}
