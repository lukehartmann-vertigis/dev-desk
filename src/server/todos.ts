import { asc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mutationSchema, type Mutation, type TodoList, type Reference } from '../lib/contracts';
import { AppError } from './errors';
import { todos, receipts, approvals } from './schema';
import { meta, setMeta, type Store } from './store';
import type { Azure } from './azure';

/**
 * Verifies only new/changed references before the short synchronous write transaction.
 * The final guard binds authorization to the settings revision and the caller's active run.
 */
export async function mutateTodoWithReference(
	store: Store,
	input: Mutation,
	azure: Pick<Azure, 'selection' | 'verify' | 'validate' | 'assertRevision'>,
	signal: AbortSignal,
	guard: () => void = () => {},
) {
	const command = mutationSchema.parse(input);
	const check = () => {
		if (signal.aborted) {
			throw new AppError('CANCELLED', 'The operation was cancelled.', 409);
		}
		guard();
	};
	check();
	if (store.db.select().from(receipts).where(eq(receipts.id, command.requestId)).get()) {
		return mutateTodo(store, command);
	}
	const current =
		'id' in command ? readTodos(store).items.find((todo) => todo.id === command.id) : undefined;
	const reference =
		command.kind === 'create' || command.kind === 'edit' ? command.reference : null;
	const revision = azure.selection.revision;
	if (reference && JSON.stringify(reference) !== JSON.stringify(current?.reference)) {
		await azure.verify(reference, signal);
		check();
		azure.assertRevision(revision);
	}
	return mutateTodo(store, command, (value) => {
		check();
		azure.assertRevision(revision);
		azure.validate(value);
	});
}

/** Reads the complete local list in stored position order without contacting Azure DevOps. */
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
/**
 * Validates and atomically commits a command, list revision, and retry receipt.
 * Replaying the same request returns its recorded outcome without another write.
 * Throws on invalid input, stale revisions, changed retry payloads, or storage failure.
 * The reference validator runs only for new/changed non-null references, inside the transaction.
 */
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
			if (receipt.payload !== payload) {
				throw new AppError(
					'REQUEST_REUSED',
					'This request ID was already used for another operation.',
					409,
				);
			}
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
			if (command.reference) {
				validateReference(command.reference);
			}
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
			) {
				throw new AppError(
					'CONFLICT',
					'The list changed. Reload the current order and try again.',
					409,
				);
			}
			command.ids.forEach((id, position) =>
				store.db
					.update(todos)
					.set({ position, updatedAt: now })
					.where(eq(todos.id, id))
					.run(),
			);
		} else {
			const todo = current.items.find((item) => item.id === command.id);
			if (!todo || todo.revision !== command.revision) {
				throw new AppError(
					'CONFLICT',
					'This todo changed or was deleted. The current list has been refreshed; review it before retrying.',
					409,
				);
			}
			if (
				command.kind === 'edit' &&
				command.reference &&
				JSON.stringify(command.reference) !== JSON.stringify(todo.reference)
			) {
				validateReference(command.reference);
			}
			if (command.kind === 'delete') {
				store.db.delete(todos).where(eq(todos.id, todo.id)).run();
			} else {
				const changes: Partial<typeof todos.$inferInsert> = {
					revision: todo.revision + 1,
					updatedAt: now,
				};
				if (command.kind === 'edit') {
					changes.title = command.title;
					changes.reference = command.reference;
				} else {
					changes.completedAt = command.completed ? (todo.completedAt ?? now) : null;
					changes.position = todo.position;
					if (!command.completed && todo.completedAt) {
						changes.position = nextPosition;
					}
				}
				store.db.update(todos).set(changes).where(eq(todos.id, todo.id)).run();
			}
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
/** Reads unconsumed approvals whose UTC expiry is still in the future; it does not consume them. */
export function pendingApprovals(store: Store) {
	return store.db
		.select()
		.from(approvals)
		.all()
		.filter((approval) => !approval.consumed && approval.expiresAt > new Date().toISOString());
}
/**
 * Consumes an exact, unexpired approval and optionally deletes its bound todo revision.
 * Both changes are transactional; expired/used approvals and stale todos throw AppError.
 * Rejecting consumes the approval without modifying the todo.
 */
export function approveDeletion(store: Store, id: string, accept: boolean, requestId: string) {
	return store.db.transaction(() => {
		const approval = store.db.select().from(approvals).where(eq(approvals.id, id)).get();
		if (!approval || approval.consumed || approval.expiresAt <= new Date().toISOString()) {
			throw new AppError(
				'APPROVAL_EXPIRED',
				'The deletion approval is expired or has already been used.',
				409,
			);
		}
		if (accept) {
			mutateTodo(store, {
				kind: 'delete',
				id: approval.todoId,
				revision: approval.revision,
				requestId,
			});
		}
		store.db.update(approvals).set({ consumed: 1 }).where(eq(approvals.id, id)).run();
		return readTodos(store);
	});
}
