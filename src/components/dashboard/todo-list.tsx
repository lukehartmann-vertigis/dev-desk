'use client';
import { useState, type FormEvent, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
	referenceUrl,
	type TodoList,
	type Todo,
	type Mutation,
	type Reference,
} from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';
import type { ClientCommand } from './api';
interface TodoListProps {
	list: TodoList;
	title: string;
	setTitle: (value: string) => void;
	busy: boolean;
	input: RefObject<HTMLInputElement | null>;
	create: (event: FormEvent) => void;
	mutate: (command: ClientCommand<Mutation>) => Promise<boolean>;
	edit: (todo: Todo) => void;
	setDeleting: (todo: Todo | null) => void;
	reorder: (id: string, target: number) => Promise<void>;
	checkReference: (reference: Reference) => Promise<void>;
	referenceStatus: Record<string, string>;
}
/** Presents persistent todos and ordering controls; only successful controller writes clear input. */
export function TodoListCard({
	list,
	title,
	setTitle,
	busy,
	input,
	create,
	mutate,
	edit,
	setDeleting,
	reorder,
	checkReference,
	referenceStatus,
}: TodoListProps) {
	const [dragId, setDragId] = useState<string | null>(null);
	const reduceMotion = useReducedMotion();
	const open = list.items.filter((todo) => !todo.completedAt);
	const completed = list.items
		.filter((todo) => todo.completedAt)
		.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
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
				if (!todo.completedAt) {
					event.preventDefault();
				}
			}}
			onDrop={(event) => {
				event.preventDefault();
				if (dragId) {
					void reorder(dragId, index);
				}
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
								if (todo.reference) {
									void checkReference(todo.reference);
								}
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
						{formatTimestamp(todo.completedAt)}
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
						) {
							event.preventDefault();
						}
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
	);
}
