import {
	matchesBoardArea,
	type BoardScope,
	type PullRequest,
	type Snapshot,
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
