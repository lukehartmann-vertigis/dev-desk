'use client';
import { useEffect, useId, useRef, type FormEvent } from 'react';
import { referenceUrl, type Approval, type DashboardState } from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';

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
/** Controlled transcript/composer state; callbacks own provider I/O and confirmed deletion. */
export type ChatProps = {
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
/** Renders durable chat, bounded streaming state, IME-safe Enter submission and deletion requests. */
export function ChatPanel({
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
	const end = useRef<HTMLDivElement>(null);
	const keyboardHint = useId();
	const canSend =
		Boolean(prompt.trim()) &&
		!streaming &&
		!state.copilot.running &&
		state.copilot.state === 'ready' &&
		!state.copilot.cleanupPending;
	let status = state.copilot.state === 'ready' ? 'Configured' : 'Not configured';
	if (state.copilot.running || streaming) {
		status = 'Working...';
	}
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [state.chat.length, streamed]);
	return (
		<div className="chat-panel">
			<header className="flex items-center justify-between gap-2 border-b border-[var(--line)] p-5">
				<div>
					<h2>Copilot assistant</h2>
					<p className="text-xs">{status}</p>
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
							{formatTimestamp(message.createdAt)}
						</time>
					</article>
				))}
				{state.approvals.map((item) => (
					<div className="notice" key={item.id}>
						<strong>Deletion approval needed</strong>
						<p className="my-2 break-words">{item.title}</p>
						<p className="mb-3 text-xs">
							Expires {formatTimestamp(item.expiresAt)}. No deletion has occurred.
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
							if (canSend && !event.repeat) {
								event.currentTarget.form?.requestSubmit();
							}
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
