'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { type Approval, type ConversationSummary, type DashboardState } from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';
import { HandoffCard } from './handoff-card';
import { MessageContent } from './message-content';
import { ToolOutcome } from './tool-outcome';

/** Controlled transcript/composer state; callbacks own provider I/O, selection and confirmations. */
export type ChatProps = {
	state: DashboardState;
	prompt: string;
	setPrompt: (value: string) => void;
	streaming: boolean;
	streamed: string;
	send: (event: FormEvent) => void;
	cancel: () => void;
	newChat: () => void;
	openChat: (id: string) => void;
	removeChat: (conversation: ConversationSummary) => void;
	retryCleanup: () => void;
	approval: (approval: Approval) => void;
	focusMessage: string | null;
	focused: () => void;
};
/**
 * Renders the selected durable chat, its history, bounded streaming state, IME-safe Enter
 * submission, handoff references and deletion requests. Switching is disabled during a run.
 */
export function ChatPanel({
	state,
	prompt,
	setPrompt,
	streaming,
	streamed,
	send,
	cancel,
	newChat,
	openChat,
	removeChat,
	retryCleanup,
	approval,
	focusMessage,
	focused,
}: ChatProps) {
	const end = useRef<HTMLDivElement>(null);
	const log = useRef<HTMLDivElement>(null);
	const keyboardHint = useId();
	const historyId = useId();
	const [historyOpen, setHistoryOpen] = useState(false);
	const current = state.conversations.find((entry) => entry.id === state.conversationId);
	const working = streaming || state.copilot.running;
	const removing = Boolean(current?.cleanupPending);
	const canSend =
		Boolean(prompt.trim()) &&
		!working &&
		state.copilot.state === 'ready' &&
		!state.copilot.cleanupPending &&
		!removing;
	let status = state.copilot.state === 'ready' ? 'Configured' : 'Not configured';
	if (working) {
		status = 'Working...';
	}
	useEffect(() => {
		end.current?.scrollIntoView({ block: 'nearest' });
	}, [state.chat.length, streamed]);
	useEffect(() => {
		if (!focusMessage) {
			return;
		}
		const target = log.current?.querySelector(
			`[data-message-id="${CSS.escape(focusMessage)}"]`,
		);
		if (target instanceof HTMLElement) {
			target.scrollIntoView({ block: 'center' });
			target.focus();
			focused();
		}
	}, [focusMessage, focused, state.chat]);
	return (
		<div className="chat-panel">
			<header className="border-b border-[var(--line)] p-5">
				<div className="min-w-0">
					<h2>Copilot assistant</h2>
					<p className="truncate text-xs">
						{status} · {current ? current.title : 'New chat'}
					</p>
				</div>
				<div className="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						className="text-xs"
						onClick={newChat}
						disabled={working || !state.conversationId}
					>
						New chat
					</button>
					<button
						type="button"
						className="text-xs"
						aria-expanded={historyOpen}
						aria-controls={historyId}
						onClick={() => setHistoryOpen((open) => !open)}
					>
						History ({state.conversations.length})
					</button>
					<button
						type="button"
						className="text-xs"
						onClick={() => current && removeChat(current)}
						disabled={!current}
					>
						Delete chat
					</button>
				</div>
				{historyOpen && (
					<nav id={historyId} aria-label="Chat history" className="chat-history">
						{working && (
							<p className="mb-2 text-[10px]">
								Finish or cancel the active run before switching chats.
							</p>
						)}
						{state.conversations.length ? (
							<ul>
								{state.conversations.map((entry) => (
									<li key={entry.id}>
										<button
											type="button"
											className="chat-history-item"
											aria-current={
												entry.id === state.conversationId
													? 'true'
													: undefined
											}
											disabled={working && entry.id !== state.conversationId}
											onClick={() => {
												openChat(entry.id);
												setHistoryOpen(false);
											}}
										>
											<span className="chat-history-title">
												{entry.title}
											</span>
											<span className="text-[10px] text-[var(--muted)]">
												{entry.cleanupPending
													? 'Removal incomplete'
													: formatTimestamp(entry.updatedAt)}
											</span>
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-xs">No saved chats yet.</p>
						)}
					</nav>
				)}
			</header>
			<div className="messages" role="log" aria-label="Conversation" ref={log}>
				{state.copilot.state !== 'ready' && (
					<p className="notice">{state.copilot.message}</p>
				)}
				{state.copilot.cleanupPending && (
					<div className="notice error">
						<p>Copilot cleanup is incomplete; new runs are blocked.</p>
						<button type="button" className="mt-2 text-xs" onClick={retryCleanup}>
							Retry cleanup
						</button>
					</div>
				)}
				{removing && (
					<p className="notice error">
						Removal of this chat is incomplete and it cannot continue. Use Delete chat
						to retry.
					</p>
				)}
				{!state.chat.length && (
					<div className="py-8">
						<h3>A little less context switching.</h3>
						<p className="mt-2 text-sm">
							Ask about your work, summarize a PR, prepare a planning handoff for a
							work item, or tell me to create a todo.
						</p>
					</div>
				)}
				{state.chat.map((message) => {
					if (message.role === 'tool') {
						return message.handoff ? (
							<HandoffCard key={message.id} handoff={message.handoff} />
						) : (
							<ToolOutcome key={message.id} message={message} />
						);
					}
					return (
						<article
							key={message.id}
							className={`bubble ${message.role}`}
							data-message-id={message.id}
							tabIndex={-1}
						>
							<div className="mb-2 flex flex-wrap justify-between gap-2 text-[10px] font-bold tracking-wider uppercase">
								<span>{message.role}</span>
								<span>{message.status}</span>
							</div>
							<MessageContent
								text={
									message.status === 'running' && message.role === 'assistant'
										? streamed || message.content || 'Thinking...'
										: message.content
								}
								role={message.role}
								state={state}
							/>
							<time
								className="mt-2 block text-[10px] text-[var(--muted)]"
								dateTime={message.createdAt}
							>
								{formatTimestamp(message.createdAt)}
							</time>
						</article>
					);
				})}
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
					disabled={working || removing || state.copilot.state !== 'ready'}
				/>
				<p id={keyboardHint} className="mt-1 text-[10px]">
					Enter to send. Shift+Enter for a new line.
				</p>
				<div className="mt-2 flex justify-end gap-2">
					{working ? (
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
					always needs separate approval. Chats and handoffs stay stored locally until you
					delete them.
				</p>
			</form>
		</div>
	);
}
