import { asc, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Reference } from '../lib/contracts';
import {
	handoffFormat,
	handoffMarkdown,
	type ChatHandoff,
	type HandoffContent,
	type HandoffDetail,
	type HandoffSummary,
	type HandoffVersion,
} from '../lib/contracts/handoffs';
import { AppError } from './errors';
import { handoffs, handoffVersions, messages, receipts } from './schema';
import type { Store } from './store';

/** Server-derived context and validated content for one handoff tool operation. */
export interface HandoffCommand {
	operationId: string;
	conversationId: string;
	runId: string;
	requestMessageId: string;
	toolName: string;
	reference: Reference;
	title: string;
	content: HandoffContent;
	retrievedAt: string;
	sourceIncomplete: boolean;
	reviseHandoffId?: string | undefined;
}

const resultSchema = z.object({
	handoffId: z.string(),
	versionId: z.string(),
	version: z.number().int().positive(),
});

/** Committed identity of a created version, as returned to the model and replayed on retry. */
export type HandoffResult = z.infer<typeof resultSchema>;

/**
 * Atomically creates a handoff version, its operation receipt, and the tool-result chat message
 * referencing it. Replays of the same operation return the committed result without writing.
 * Throws REQUEST_REUSED for conflicting replays, NOT_FOUND/CONFLICT for invalid revision targets.
 */
export function createHandoffVersion(store: Store, command: HandoffCommand) {
	const payload = createHash('sha256')
		.update(
			JSON.stringify([
				command.reference,
				command.title,
				command.content,
				command.reviseHandoffId ?? null,
			]),
		)
		.digest('hex');
	return store.db.transaction(() => {
		const receipt = store.db
			.select()
			.from(receipts)
			.where(eq(receipts.id, command.operationId))
			.get();
		if (receipt) {
			if (receipt.payload !== payload) {
				throw new AppError(
					'REQUEST_REUSED',
					'This handoff operation was already used for different content.',
					409,
				);
			}
			return { result: resultSchema.parse(JSON.parse(receipt.result)), replayed: true };
		}
		const now = new Date().toISOString();
		let handoffId = command.reviseHandoffId;
		let version = 1;
		if (handoffId) {
			const latest = store.db
				.select()
				.from(handoffVersions)
				.where(eq(handoffVersions.handoffId, handoffId))
				.orderBy(desc(handoffVersions.version))
				.get();
			if (!latest) {
				throw new AppError('NOT_FOUND', 'The handoff to revise does not exist.', 404);
			}
			if (JSON.stringify(latest.reference) !== JSON.stringify(command.reference)) {
				throw new AppError(
					'CONFLICT',
					'A revision must keep the same work item. Create a new handoff instead.',
					409,
				);
			}
			version = latest.version + 1;
			store.db
				.update(handoffs)
				.set({ updatedAt: now })
				.where(eq(handoffs.id, handoffId))
				.run();
		} else {
			handoffId = randomUUID();
			store.db
				.insert(handoffs)
				.values({ id: handoffId, createdAt: now, updatedAt: now })
				.run();
		}
		const result: HandoffResult = { handoffId, versionId: randomUUID(), version };
		store.db
			.insert(handoffVersions)
			.values({
				id: result.versionId,
				handoffId,
				version,
				format: handoffFormat,
				title: command.title,
				reference: command.reference,
				content: command.content,
				retrievedAt: command.retrievedAt,
				sourceIncomplete: command.sourceIncomplete,
				originMessageId: command.requestMessageId,
				originRunId: command.runId,
				createdAt: now,
			})
			.run();
		store.db
			.insert(messages)
			.values({
				id: randomUUID(),
				conversationId: command.conversationId,
				runId: command.runId,
				role: 'tool',
				content: JSON.stringify({ tool: command.toolName, outcome: { ok: true, result } }),
				status: 'complete',
				createdAt: now,
				handoffVersionId: result.versionId,
			})
			.run();
		store.db
			.insert(receipts)
			.values({ id: command.operationId, payload, result: JSON.stringify(result) })
			.run();
		return { result, replayed: false };
	});
}

function toVersion(
	row: typeof handoffVersions.$inferSelect,
	conversationId: string | null,
): HandoffVersion {
	const snapshot = {
		format: row.format,
		version: row.version,
		title: row.title,
		reference: row.reference,
		retrievedAt: row.retrievedAt,
		sourceIncomplete: row.sourceIncomplete,
		createdAt: row.createdAt,
		content: row.content,
	};
	return {
		...snapshot,
		id: row.id,
		handoffId: row.handoffId,
		markdown: handoffMarkdown(snapshot),
		conversationId,
		originMessageId: row.originMessageId,
		originRunId: row.originRunId,
	};
}

/** Lists saved handoffs by latest activity from local storage only; empty means none are saved. */
export function listHandoffs(store: Store): HandoffSummary[] {
	const versions = store.db
		.select({
			id: handoffVersions.id,
			handoffId: handoffVersions.handoffId,
			version: handoffVersions.version,
			title: handoffVersions.title,
			reference: handoffVersions.reference,
		})
		.from(handoffVersions)
		.orderBy(asc(handoffVersions.version))
		.all();
	return store.db
		.select()
		.from(handoffs)
		.orderBy(desc(handoffs.updatedAt), asc(handoffs.id))
		.all()
		.flatMap((handoff) => {
			const owned = versions.filter((version) => version.handoffId === handoff.id);
			const latest = owned.at(-1);
			return latest
				? [
						{
							...handoff,
							versionCount: owned.length,
							latest: {
								id: latest.id,
								version: latest.version,
								title: latest.title,
								reference: latest.reference,
							},
						},
					]
				: [];
		});
}

/** Reads one handoff with all versions and current provenance; throws NOT_FOUND when removed. */
export function readHandoff(store: Store, id: string): HandoffDetail {
	const handoff = store.db.select().from(handoffs).where(eq(handoffs.id, id)).get();
	if (!handoff) {
		throw new AppError('NOT_FOUND', 'This handoff is no longer available.', 404);
	}
	const rows = store.db
		.select({ version: handoffVersions, conversationId: messages.conversationId })
		.from(handoffVersions)
		.leftJoin(messages, eq(messages.id, handoffVersions.originMessageId))
		.where(eq(handoffVersions.handoffId, id))
		.orderBy(asc(handoffVersions.version))
		.all();
	return {
		...handoff,
		versions: rows.map((row) => toVersion(row.version, row.conversationId)),
	};
}

/** Resolves a chat reference to its exact stored version without upstream access. */
export function chatHandoff(store: Store, versionId: string | null): ChatHandoff {
	const row = versionId
		? store.db.select().from(handoffVersions).where(eq(handoffVersions.id, versionId)).get()
		: undefined;
	if (!row) {
		return { state: 'unavailable' };
	}
	const version = toVersion(row, null);
	return {
		state: 'available',
		handoffId: version.handoffId,
		versionId: version.id,
		version: version.version,
		title: version.title,
		markdown: version.markdown,
	};
}

/**
 * Deletes one handoff and all saved versions after confirmation bound to its latest version.
 * A changed version set throws CONFLICT; chats keep messages whose references become unavailable.
 */
export function deleteHandoff(store: Store, id: string, latestVersion: number) {
	store.db.transaction(() => {
		const latest = store.db
			.select({ version: handoffVersions.version })
			.from(handoffVersions)
			.where(eq(handoffVersions.handoffId, id))
			.orderBy(desc(handoffVersions.version))
			.get();
		if (!latest) {
			throw new AppError('NOT_FOUND', 'This handoff is no longer available.', 404);
		}
		if (latest.version !== latestVersion) {
			throw new AppError(
				'CONFLICT',
				'This handoff has changed. Review its versions and confirm deletion again.',
				409,
			);
		}
		store.db.delete(handoffs).where(eq(handoffs.id, id)).run();
	});
}
