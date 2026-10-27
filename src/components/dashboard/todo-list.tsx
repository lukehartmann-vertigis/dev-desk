'use client';
import { useId, type FormEvent, type RefCallback, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
	type CollisionDetection,
	type Modifier,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
type TodoRowProps = Pick<
	TodoListProps,
	'busy' | 'mutate' | 'edit' | 'setDeleting' | 'reorder' | 'checkReference' | 'referenceStatus'
> & {
	todo: Todo;
	index: number;
	openCount: number;
	reduceMotion: boolean;
};
type Sorting = Pick<
	ReturnType<typeof useSortable>,
	'attributes' | 'listeners' | 'transform' | 'transition' | 'isDragging' | 'isSorting'
>;
const todoCollision: CollisionDetection = (args) =>
	args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function SortableTodoRow(props: TodoRowProps) {
	const {
		setNodeRef,
		setActivatorNodeRef,
		attributes,
		listeners,
		transform,
		transition,
		isDragging,
		isSorting,
	} = useSortable({ id: props.todo.id, disabled: props.busy });
	return (
		<TodoRow
			{...props}
			rowRef={setNodeRef}
			handleRef={setActivatorNodeRef}
			sorting={{ attributes, listeners, transform, transition, isDragging, isSorting }}
		/>
	);
}

function TodoRow({
	todo,
	index,
	openCount,
	reduceMotion,
	busy,
	mutate,
	edit,
	setDeleting,
	reorder,
	checkReference,
	referenceStatus,
	sorting,
	rowRef,
	handleRef,
}: TodoRowProps & {
	sorting?: Sorting;
	rowRef?: RefCallback<HTMLLIElement>;
	handleRef?: RefCallback<HTMLButtonElement>;
}) {
	const disabled = busy || Boolean(sorting?.isSorting);
	return (
		<motion.li
			ref={rowRef}
			style={
				sorting
					? {
							transform: CSS.Transform.toString(sorting.transform),
							transition: reduceMotion ? 'none' : sorting.transition,
						}
					: {}
			}
			initial={false}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: reduceMotion ? 0 : 0.12 }}
			className="todo-row"
			data-dragging={sorting?.isDragging || undefined}
		>
			{sorting && (
				<button
					ref={handleRef}
					{...sorting.attributes}
					{...sorting.listeners}
					type="button"
					className="drag-handle"
					aria-label={`Reorder ${todo.title}`}
					title="Drag to reorder"
					disabled={busy}
				>
					<svg
						width="12"
						height="18"
						viewBox="0 0 16 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<circle cx="5" cy="5" r="1.5" />
						<circle cx="11" cy="5" r="1.5" />
						<circle cx="5" cy="12" r="1.5" />
						<circle cx="11" cy="12" r="1.5" />
						<circle cx="5" cy="19" r="1.5" />
						<circle cx="11" cy="19" r="1.5" />
					</svg>
				</button>
			)}
			<input
				type="checkbox"
				aria-label={`${todo.completedAt ? 'Reopen' : 'Complete'} ${todo.title}`}
				checked={Boolean(todo.completedAt)}
				disabled={disabled}
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
								disabled ||
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
							disabled={disabled || index === 0}
							onClick={() => void reorder(todo.id, index - 1)}
						>
							Up
						</button>
						<button
							title="Move down"
							aria-label={`Move ${todo.title} down`}
							disabled={disabled || index === openCount - 1}
							onClick={() => void reorder(todo.id, index + 1)}
						>
							Down
						</button>
					</>
				)}
				<button
					disabled={disabled}
					onClick={() => edit(todo)}
					aria-label={`Edit ${todo.title}`}
				>
					Edit
				</button>
				<button
					disabled={disabled}
					className="danger"
					onClick={() => setDeleting(todo)}
					aria-label={`Delete ${todo.title}`}
				>
					Delete
				</button>
			</div>
		</motion.li>
	);
}

/** Persistent todo controls with handle-only vertical sorting, keyboard access and reduced motion. */
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
	const id = useId();
	const reduceMotion = Boolean(useReducedMotion());
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	const open = list.items.filter((todo) => !todo.completedAt);
	const completed = list.items
		.filter((todo) => todo.completedAt)
		.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
	const rowProps = {
		busy,
		mutate,
		edit,
		setDeleting,
		reorder,
		checkReference,
		referenceStatus,
		reduceMotion,
		openCount: open.length,
	};
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
			<DndContext
				id={id}
				sensors={sensors}
				modifiers={[restrictToVerticalAxis]}
				collisionDetection={todoCollision}
				accessibility={{
					screenReaderInstructions: {
						draggable:
							'Press Space to pick up a todo. Use arrow keys to move it, Space to drop, or Escape to cancel.',
					},
					announcements: {
						onDragStart: ({ active }) =>
							`Picked up ${open.find((todo) => todo.id === active.id)?.title ?? 'removed todo'}.`,
						onDragOver: ({ over }) =>
							over
								? `Over position ${open.findIndex((todo) => todo.id === over.id) + 1} of ${open.length}.`
								: 'Outside the open todo list.',
						onDragEnd: ({ active, over }) =>
							over && active.id !== over.id && !busy
								? 'Dropped. Saving the new order.'
								: 'Order unchanged.',
						onDragCancel: () => 'Reordering cancelled. Order unchanged.',
					},
				}}
				onDragEnd={({ active, over }) => {
					if (busy || !over || active.id === over.id) {
						return;
					}
					const source = open.find((todo) => todo.id === active.id);
					const target = open.findIndex((todo) => todo.id === over.id);
					if (source && target >= 0) {
						void reorder(source.id, target);
					}
				}}
			>
				<SortableContext
					items={open.map((todo) => todo.id)}
					strategy={verticalListSortingStrategy}
				>
					<ul>
						<AnimatePresence initial={false}>
							{open.map((todo, index) => (
								<SortableTodoRow
									key={todo.id}
									{...rowProps}
									todo={todo}
									index={index}
								/>
							))}
						</AnimatePresence>
					</ul>
				</SortableContext>
			</DndContext>
			{!open.length && (
				<p className="empty">Nothing on your list. Add your first todo above.</p>
			)}
			<details className="completed">
				<summary>Completed ({completed.length})</summary>
				<ul>
					{completed.map((todo, index) => (
						<TodoRow key={todo.id} {...rowProps} todo={todo} index={index} />
					))}
				</ul>
			</details>
			<footer className="card-footer">
				Drag the handle to reorder, or use Up/Down. Saved locally. No rollover, no automatic
				expiry.
			</footer>
		</section>
	);
}
