'use client';
import { useId, useRef, useState } from 'react';
import {
	type BoardScope,
	type DashboardState,
	type WorkItem,
	type PullRequest,
} from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';
import { ScopeLabel, type LegendEntry } from './scope-legend';
import { groupDevOpsRows } from './devops-groups';
const devOpsTabs = [
	{ dataset: 'work', label: 'Assigned work items' },
	{ dataset: 'reviews', label: 'Review requests' },
	{ dataset: 'own', label: 'Your pull requests' },
] as const;
type DevOpsDataset = (typeof devOpsTabs)[number]['dataset'];
type DevOpsProps = {
	state: DashboardState;
	repositories: LegendEntry[];
	boards: LegendEntry[];
};

function tabIndexForKey(key: string, index: number): number | null {
	switch (key) {
		case 'ArrowRight':
			return (index + 1) % devOpsTabs.length;
		case 'ArrowLeft':
			return (index + devOpsTabs.length - 1) % devOpsTabs.length;
		case 'Home':
			return 0;
		case 'End':
			return devOpsTabs.length - 1;
		default:
			return null;
	}
}
/** Local counted tabs and single-select scope chips; each tab retains its own selected identity. */
export function DevOpsTabs({ state, repositories, boards }: DevOpsProps) {
	const [active, setActive] = useState<DevOpsDataset>('work');
	const [selections, setSelections] = useState<Partial<Record<DevOpsDataset, string>>>({});
	const id = useId();
	const buttons = useRef(new Map<DevOpsDataset, HTMLButtonElement>());
	return (
		<section className="card" aria-label="Azure DevOps">
			<div className="devops-tabs" role="tablist" aria-label="Azure DevOps views">
				{devOpsTabs.map(({ dataset, label }, index) => {
					const scopes = state.ado.snapshots.filter((scope) => scope.dataset === dataset);
					const count = scopes.reduce((total, scope) => total + scope.data.length, 0);
					const stale =
						scopes.some((scope) => scope.stale) ||
						(dataset === 'work' && state.ado.boardScopes.some((scope) => scope.stale));
					return (
						<button
							key={dataset}
							ref={(element) => {
								if (element) {
									buttons.current.set(dataset, element);
								} else {
									buttons.current.delete(dataset);
								}
							}}
							type="button"
							role="tab"
							id={`${id}-tab-${dataset}`}
							aria-controls={`${id}-panel-${dataset}`}
							aria-selected={active === dataset}
							tabIndex={active === dataset ? 0 : -1}
							className="devops-tab"
							data-dataset={dataset}
							onClick={() => setActive(dataset)}
							onKeyDown={(event) => {
								const target = tabIndexForKey(event.key, index);
								if (target === null) {
									return;
								}
								event.preventDefault();
								const tab = devOpsTabs[target];
								if (tab) {
									setActive(tab.dataset);
									buttons.current.get(tab.dataset)?.focus();
								}
							}}
						>
							<span>
								{label}
								{stale && (
									<span className="tab-warning" title="Stale or incomplete data">
										<span aria-hidden="true"> !</span>
										<span className="sr-only"> Stale or incomplete data</span>
									</span>
								)}
							</span>
							<span className="badge tab-count">
								{count}
								<span className="sr-only">{count === 1 ? ' item' : ' items'}</span>
							</span>
						</button>
					);
				})}
			</div>
			{devOpsTabs.map(({ dataset }) => (
				<div
					key={dataset}
					role="tabpanel"
					id={`${id}-panel-${dataset}`}
					aria-labelledby={`${id}-tab-${dataset}`}
					hidden={active !== dataset}
					tabIndex={0}
				>
					{active === dataset && (
						<DevOpsPanel
							dataset={dataset}
							state={state}
							repositories={repositories}
							boards={boards}
							selection={selections[dataset]}
							select={(scopeId) =>
								setSelections((previous) => ({ ...previous, [dataset]: scopeId }))
							}
						/>
					)}
				</div>
			))}
		</section>
	);
}

function DevOpsPanel({
	dataset,
	state,
	repositories,
	boards,
	selection,
	select,
}: DevOpsProps & {
	dataset: DevOpsDataset;
	selection: string | undefined;
	select: (scopeId: string) => void;
}) {
	const scopes = state.ado.snapshots.filter((scope) => scope.dataset === dataset);
	const rows = scopes.flatMap<WorkItem | PullRequest>((scope) => scope.data);
	const groups = groupDevOpsRows({
		dataset,
		rows,
		boardScopes: state.ado.boardScopes,
		repositories,
		boards,
	});
	const selected = groups.find((group) => group.id === selection) ?? groups[0];
	const visible = selected?.rows ?? [];
	let emptyMessage = 'No matching items in the successfully synchronized scopes.';
	if (state.ado.state !== 'ready') {
		emptyMessage = 'Integration is not available.';
	} else if (!scopes.length || scopes.every((scope) => !scope.successAt)) {
		emptyMessage = 'Not synchronized yet.';
	} else if (rows.length) {
		emptyMessage = 'No matching items in the selected scope.';
	}
	return (
		<div className="devops-panel-content">
			{groups.length > 0 && (
				<div
					className="scope-chips"
					role="group"
					aria-label={
						dataset === 'work'
							? 'Filter work items by team'
							: 'Filter pull requests by repository'
					}
				>
					{groups.map((group) => (
						<button
							key={group.id}
							type="button"
							className="scope-chip"
							aria-pressed={selected?.id === group.id}
							aria-label={`${group.label}, ${group.rows.length} ${group.rows.length === 1 ? 'item' : 'items'}`}
							style={{
								borderColor: group.color,
								backgroundColor:
									selected?.id === group.id
										? `color-mix(in srgb, ${group.color} 20%, transparent)`
										: undefined,
							}}
							onClick={() => select(group.id)}
						>
							<ScopeLabel entry={group} />
							<span className="scope-count" aria-hidden="true">
								{group.rows.length}
							</span>
						</button>
					))}
				</div>
			)}
			{scopes.some((scope) => scope.stale) && (
				<p className="px-5 pb-3 text-xs text-amber-200">
					Stale or incomplete: showing last successfully saved data where available.
				</p>
			)}
			{scopes
				.filter((scope) => scope.error)
				.map((scope) => (
					<p key={scope.scope} className="notice error mx-4 text-xs">
						{scope.scope}: {scope.error}
					</p>
				))}
			{dataset === 'work' &&
				state.ado.boardScopes.map((scope) => (
					<div key={scope.project} className="px-5 pb-3 text-xs">
						<BoardScopeNotice scope={scope} />
						<p>
							Team scopes: {scope.project} / {formatTimestamp(scope.successAt)}
						</p>
					</div>
				))}
			{!visible.length && <p className="empty">{emptyMessage}</p>}
			{visible.map(({ row, boardScope, markers }) => {
				return (
					<article
						className="work-row"
						key={`${row.project}:${'repositoryId' in row ? row.repositoryId : 'work'}:${row.id}`}
					>
						<div className="work-marker" aria-hidden="true">
							{markers.map((entry) => (
								<span key={entry.id} style={{ backgroundColor: entry.color }} />
							))}
						</div>
						<div className="min-w-0 flex-1">
							<div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
								{markers.map((entry) => (
									<ScopeLabel key={entry.id} entry={entry} />
								))}
							</div>
							<a
								className="font-medium"
								href={row.url}
								target="_blank"
								rel="noopener noreferrer"
							>
								{'repositoryId' in row ? 'PR' : '#'}
								{row.id} {row.title}
							</a>
							{'repositoryId' in row ? (
								<PrMeta row={row} />
							) : (
								<WorkMeta
									row={row}
									scope={boardScope}
									markerCount={markers.length}
								/>
							)}
						</div>
					</article>
				);
			})}
			<footer className="card-footer">
				{!scopes.length
					? 'Never synchronized'
					: scopes.map((scope) => (
							<div key={scope.scope} className="break-words">
								{scope.scope}: {formatTimestamp(scope.successAt)}
							</div>
						))}
			</footer>
		</div>
	);
}

function BoardScopeNotice({ scope }: { scope: BoardScope }) {
	if (scope.error) {
		return (
			<p className="notice error">
				Board mapping for {scope.project}: {scope.error}
			</p>
		);
	}
	if (scope.stale) {
		return (
			<p className="text-amber-200">
				Board mapping for {scope.project}:{' '}
				{scope.successAt ? 'stale team scopes.' : 'not synchronized yet.'}
			</p>
		);
	}
	return null;
}

function WorkMeta({
	row,
	scope,
	markerCount,
}: {
	row: WorkItem;
	scope: BoardScope | undefined;
	markerCount: number;
}) {
	let mapping = '';
	if (!row.areaPath || !scope?.successAt) {
		mapping = ' / Board mapping unavailable';
	} else if (scope.stale) {
		mapping = ' / Board mapping stale';
	} else if (!markerCount) {
		mapping = ' / No matching team board';
	}
	return (
		<>
			<p className="mt-1 text-xs">
				{row.project} / {row.type} / {row.state} / Priority {row.priority ?? 'unavailable'}
			</p>
			<p className="mt-1 text-xs">
				{row.areaPath ?? 'Area path unavailable'}
				{mapping}
			</p>
		</>
	);
}

function PrMeta({ row }: { row: PullRequest }) {
	const votes = new Map([
		[10, 'Approved'],
		[5, 'Approved with suggestions'],
		[0, 'No vote'],
		[-5, 'Waiting for author'],
		[-10, 'Rejected'],
	]);
	return (
		<>
			<p className="mt-1 text-xs">
				{row.project} / {row.repository} / {row.author}
				{row.draft ? ' / Draft' : ''} / {row.reason}
			</p>
			<details className="mt-2 text-xs">
				<summary>Review votes ({row.reviewers.length})</summary>
				{row.reviewers.map((reviewer) => (
					<p key={reviewer.id} className="mt-1">
						{reviewer.name}
						{reviewer.group ? ' (group)' : ''}
						{reviewer.required ? ' (required)' : ''}:{' '}
						{reviewer.vote === null
							? 'Vote unavailable'
							: (votes.get(reviewer.vote) ?? `Vote ${reviewer.vote}`)}
					</p>
				))}
			</details>
		</>
	);
}
