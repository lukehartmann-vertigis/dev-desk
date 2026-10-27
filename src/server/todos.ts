import { asc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mutationSchema, type Mutation, type TodoList, type Reference } from '../lib/contracts';
import { AppError } from './errors';
import { todos, receipts, approvals } from './schema';
import { meta, setMeta, type Store } from './store';

export function readTodos(store: Store): TodoList {
	return {
		revision: Number(meta(store, 'listRevision')),
		items: store.db
			.select()
			.from(todos)
			.orderBy(asc(todos.position))
			.all()
			.map((todo) => ({ ...todo, reference: todo.reference ?? null })),
	};
}
/** Commits data and retry receipt atomically. Stale revisions and reused request IDs are errors. */
export function mutateTodo(
	store: Store,
	input: Mutation,
	validateReference: (reference: Reference) => void = () => {},
) {
	const command = mutationSchema.parse(input);
	return store.db.transaction(() => {
		const payload = createHash('sha256').update(JSON.stringify(command)).digest('hex');
		const receipt = store.db
			.select()
			.from(receipts)
			.where(eq(receipts.id, command.requestId))
			.get();
		if (receipt) {
			if (receipt.payload !== payload)
				throw new AppError(
					'REQUEST_REUSED',
					'This request ID was already used for another operation.',
					409,
				);
			return z
				.object({ listRevision: z.number(), todoId: z.string().nullable() })
				.parse(JSON.parse(receipt.result));
		}
		const now = new Date().toISOString();
		const current = readTodos(store);
		let todoId: string | null = 'id' in command ? command.id : null;
		const nextPosition =
			Math.max(
				-1,
				...current.items.filter((todo) => !todo.completedAt).map((todo) => todo.position),
			) + 1;
		if (command.kind === 'create') {
			if (command.reference) validateReference(command.reference);
			todoId = randomUUID();
			store.db
				.insert(todos)
				.values({
					id: todoId,
					title: command.title,
					revision: 1,
					position: nextPosition,
					completedAt: null,
					createdAt: now,
					updatedAt: now,
					reference: command.reference,
				})
				.run();
		} else if (command.kind === 'reorder') {
			const open = current.items.filter((todo) => !todo.completedAt);
			if (
				command.listRevision !== current.revision ||
				new Set(command.ids).size !== open.length ||
				command.ids.length !== open.length ||
				command.ids.some((id) => !open.some((todo) => todo.id === id))
			)
				throw new AppError(
					'CONFLICT',
					'The list changed. Reload the current order and try again.',
					409,
				);
			command.ids.forEach((id, position) =>
				store.db
					.update(todos)
					.set({ position, updatedAt: now })
					.where(eq(todos.id, id))
					.run(),
			);
		} else {
			const todo = current.items.find((item) => item.id === command.id);
			if (!todo || todo.revision !== command.revision)
				throw new AppError(
					'CONFLICT',
					'This todo changed or was deleted. The current list has been refreshed; review it before retrying.',
					409,
				);
			if (
				command.kind === 'edit' &&
				command.reference &&
				JSON.stringify(command.reference) !== JSON.stringify(todo.reference)
			)
				validateReference(command.reference);
			if (command.kind === 'delete')
				store.db.delete(todos).where(eq(todos.id, todo.id)).run();
			else
				store.db
					.update(todos)
					.set({
						revision: todo.revision + 1,
						updatedAt: now,
						...(command.kind === 'edit'
							? { title: command.title, reference: command.reference }
							: {
									completedAt: command.completed
										? (todo.completedAt ?? now)
										: null,
									position:
										!command.completed && todo.completedAt
											? nextPosition
											: todo.position,
								}),
					})
					.where(eq(todos.id, todo.id))
					.run();
		}
		setMeta(store, 'listRevision', String(current.revision + 1));
		const result = { listRevision: current.revision + 1, todoId };
		store.db
			.insert(receipts)
			.values({ id: command.requestId, payload, result: JSON.stringify(result) })
			.run();
		return result;
	});
}
export function pendingApprovals(store: Store) {
	return store.db
		.select()
		.from(approvals)
		.all()
		.filter((approval) => !approval.consumed && approval.expiresAt > new Date().toISOString());
}
export function approveDeletion(store: Store, id: string, accept: boolean, requestId: string) {
	return store.db.transaction(() => {
		const approval = store.db.select().from(approvals).where(eq(approvals.id, id)).get();
		if (!approval || approval.consumed || approval.expiresAt <= new Date().toISOString())
			throw new AppError(
				'APPROVAL_EXPIRED',
				'The deletion approval is expired or has already been used.',
				409,
			);
		if (accept)
			mutateTodo(store, {
				kind: 'delete',
				id: approval.todoId,
				revision: approval.revision,
				requestId,
			});
		store.db.update(approvals).set({ consumed: 1 }).where(eq(approvals.id, id)).run();
		return readTodos(store);
	});
}
