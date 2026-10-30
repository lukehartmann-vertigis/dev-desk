import { z } from 'zod';
import type { BoardSwimlanes, WorkItem } from '../lib/contracts';
import type { Source } from '../lib/contracts/settings';
import type { AzureRequestOptions } from './azure-http';
import { AppError } from './errors';

const defaultLaneId = '00000000-0000-0000-0000-000000000000';
const boardReference = z.object({ id: z.uuid(), name: z.string().min(1) });
const boardSchema = boardReference.extend({
	fields: z.object({ rowField: z.object({ referenceName: z.string().min(1) }) }),
	rows: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })).min(1),
	columns: z.array(z.object({ stateMappings: z.record(z.string(), z.string()) })),
});
type Request = (
	path: string,
	options: AzureRequestOptions,
) => Promise<{ data: Record<string, unknown>; continuation: string | null }>;

/**
 * Reads every board's own lane field for already eligible assigned work, in 200-item batches.
 * Type/state mappings establish board grouping, not exact board/iteration visibility.
 * Empty lane values use the zero-ID default lane, never the first row (which can be reordered).
 * Incomplete responses throw so callers retain the entire previous team swimlane cache.
 */
export async function loadSwimlanes(
	request: Request,
	source: Source,
	items: WorkItem[],
	signal: AbortSignal,
): Promise<BoardSwimlanes[]> {
	const path = `${source.projectId}/${source.id}/_apis/work/boards`;
	const response = await request(path, { signal });
	const references = z.object({ value: z.array(boardReference).max(200) }).parse(response.data);
	if (
		response.continuation ||
		new Set(references.value.map((board) => board.id)).size !== references.value.length
	) {
		throw new AppError('INCOMPLETE', 'Board enumeration was incomplete.', 502);
	}
	const boards: z.infer<typeof boardSchema>[] = [];
	for (const reference of references.value) {
		const board = boardSchema.parse(
			(await request(`${path}/${reference.id}`, { signal })).data,
		);
		if (
			board.id !== reference.id ||
			new Set(board.rows.map((lane) => lane.id)).size !== board.rows.length
		) {
			throw new AppError(
				'INCOMPLETE',
				'Board or swimlane identities were inconsistent.',
				502,
			);
		}
		boards.push(board);
	}
	const fields = [...new Set(boards.map((board) => board.fields.rowField.referenceName))];
	const values = new Map<number, Record<string, unknown>>();
	for (let offset = 0; fields.length && offset < items.length; offset += 200) {
		const ids = items.slice(offset, offset + 200).map((item) => item.id);
		const batch = z
			.object({
				value: z.array(
					z.object({
						id: z.number().int().positive(),
						fields: z.record(z.string(), z.unknown()),
					}),
				),
			})
			.parse(
				(
					await request(`${source.projectId}/_apis/wit/workitemsbatch`, {
						signal,
						body: { ids, fields, errorPolicy: 'Fail' },
					})
				).data,
			).value;
		if (
			batch.length !== ids.length ||
			new Set(batch.map((item) => item.id)).size !== ids.length ||
			batch.some((item) => !ids.includes(item.id))
		) {
			throw new AppError('INCOMPLETE', 'Swimlane work-item batch was incomplete.', 502);
		}
		for (const item of batch) {
			values.set(item.id, item.fields);
		}
	}
	return boards.map((board) => ({
		id: board.id,
		name: board.name,
		lanes: board.rows,
		items: items
			.filter((item) =>
				board.columns.some((column) => column.stateMappings[item.type] === item.state),
			)
			.map((item) => {
				const value = z
					.string()
					.nullish()
					.parse(values.get(item.id)?.[board.fields.rowField.referenceName]);
				const lane =
					value == null || value === ''
						? board.rows.find((row) => row.id === defaultLaneId)
						: board.rows.find((row) => row.name === value);
				return { id: item.id, laneId: lane?.id ?? null };
			}),
	}));
}
