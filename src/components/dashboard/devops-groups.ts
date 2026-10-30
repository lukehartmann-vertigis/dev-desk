import {
	matchesBoardArea,
	type BoardScope,
	type PullRequest,
	type Snapshot,
	type SwimlaneScope,
	type WorkItem,
} from '../../lib/contracts';
import type { LegendEntry } from './scope-legend';

/** Cached row with the same team/repository markers used for grouping and row presentation. */
export interface GroupedDevOpsRow {
	row: WorkItem | PullRequest;
	boardScope: BoardScope | undefined;
	markers: LegendEntry[];
}

/** One local chip and its rows; overlapping team memberships intentionally repeat a row across chips. */
export interface DevOpsGroup extends LegendEntry {
	rows: GroupedDevOpsRow[];
}

/** A populated board/lane disclosure; fallback groups never discard unresolvable rows. */
export interface SwimlaneGroup {
	id: string;
	board: string | null;
	label: string;
	rows: GroupedDevOpsRow[];
}

/** Groups only the selected team's rows, preserving provider board/lane order and last-good matches. */
export function groupWorkSwimlanes(
	rows: GroupedDevOpsRow[],
	scope: SwimlaneScope | undefined,
): SwimlaneGroup[] {
	const groups: SwimlaneGroup[] = [];
	const matched = new Set<GroupedDevOpsRow>();
	for (const board of scope?.boards ?? []) {
		const assignments = new Map(board.items.map((item) => [item.id, item.laneId]));
		for (const lane of [...board.lanes, { id: null, name: 'Swimlane unavailable' }]) {
			const members = rows.filter(
				({ row }) =>
					!('repositoryId' in row) &&
					assignments.has(row.id) &&
					assignments.get(row.id) === lane.id,
			);
			if (members.length) {
				members.forEach((row) => matched.add(row));
				groups.push({
					id: `${board.id}:${lane.id ?? 'unknown'}`,
					board: board.name,
					label: lane.name || 'Default swimlane',
					rows: members,
				});
			}
		}
	}
	const evaluated = new Set(scope?.itemIds ?? []);
	const remaining = rows.filter((row) => !matched.has(row));
	const unmapped = remaining.filter(
		({ row }) =>
			!('repositoryId' in row) &&
			scope?.successAt &&
			!scope.stale &&
			!scope.error &&
			evaluated.has(row.id),
	);
	const unknown = remaining.filter((row) => !unmapped.includes(row));
	for (const fallback of [
		{ id: 'unmapped', label: 'Not mapped to a board', rows: unmapped },
		{ id: 'unknown', label: 'Swimlane unavailable', rows: unknown },
	]) {
		if (fallback.rows.length) {
			groups.push({ ...fallback, board: null });
		}
	}
	return groups;
}

/**
 * Groups cached rows in legend order without changing source data or fetching providers.
 * Known scopes remain available with zero rows. Unmatched/unknown fallbacks appear only when
 * needed; missing area metadata or unresolved/stale nonmatching team scopes remain unknown.
 */
export function groupDevOpsRows({
	dataset,
	rows,
	boardScopes,
	repositories,
	boards,
}: {
	dataset: Snapshot['dataset'];
	rows: (WorkItem | PullRequest)[];
	boardScopes: BoardScope[];
	repositories: LegendEntry[];
	boards: LegendEntry[];
}): DevOpsGroup[] {
	const entries = dataset === 'work' ? boards : repositories;
	const unknownId = dataset === 'work' ? 'unknown-team' : 'unknown-repository';
	const fallbacks: LegendEntry[] =
		dataset === 'work'
			? [
					{ id: 'no-team', label: 'No team', color: '#cbd5e1' },
					{ id: unknownId, label: 'Assignment unknown', color: '#a0acbd' },
				]
			: [{ id: unknownId, label: 'Repository unknown', color: '#a0acbd' }];
	const groups: DevOpsGroup[] = [...entries, ...fallbacks].map((entry) => ({
		...entry,
		rows: [],
	}));
	for (const row of rows) {
		const boardScope = boardScopes.find(
			(scope) => scope.project.toLowerCase() === row.project.toLowerCase(),
		);
		let markers: LegendEntry[] = [];
		let fallbackId = unknownId;
		if (dataset === 'work' && 'areaPath' in row && row.areaPath && boardScope?.successAt) {
			const areaPath = row.areaPath;
			const matchingIds = boardScope.boards
				.filter((board) => board.areas.some((area) => matchesBoardArea(areaPath, area)))
				.map((board) => board.id);
			markers = boards.filter((entry) => matchingIds.includes(entry.id));
			if (!matchingIds.length && !boardScope.stale && !boardScope.error) {
				fallbackId = 'no-team';
			}
		} else if (dataset !== 'work' && 'repositoryId' in row) {
			markers = repositories.filter((entry) => entry.id === row.repositoryId);
		}
		const memberships = markers.length ? markers.map((entry) => entry.id) : [fallbackId];
		const grouped = { row, boardScope, markers };
		for (const group of groups) {
			if (memberships.includes(group.id)) {
				group.rows.push(grouped);
			}
		}
	}
	return groups.filter(
		(group) => group.rows.length || entries.some((entry) => entry.id === group.id),
	);
}
