'use client';
import Link from 'next/link';
import type { DashboardState } from '../../lib/contracts';
/** Stable scope identity plus supplementary display color; names remain authoritative. */
export type LegendEntry = { id: string; label: string; color: string };
const scopeColors = {
	pr: ['#8e9cff', '#67c9aa', '#77bce8', '#c5a1ef', '#78d6d3', '#a8c8ed'],
	work: ['#ffd166', '#dc2626', '#e3ce72', '#ffa870', '#d9ac91', '#f2ce9b'],
};
/** Assigns deterministic colors by ID order, keeping work/PR palettes separate; does not mutate input. */
export function legendEntries(
	entries: { id: string; label: string }[],
	kind: 'pr' | 'work',
): LegendEntry[] {
	return [...entries]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((entry, index) => ({
			...entry,
			color:
				scopeColors[kind][index] ??
				`hsl(${kind === 'work' ? 5 + ((index * 137.508) % 60) : 155 + ((index * 137.508) % 125)} 65% 72%)`,
		}));
}
/** Shows a textual scope with its supplementary colored dot; never acts as a filter. */
export function ScopeLabel({ entry }: { entry: LegendEntry }) {
	return (
		<span className="scope-label" data-scope-id={entry.id}>
			<span
				className="legend-dot"
				style={{ backgroundColor: entry.color }}
				aria-hidden="true"
			/>
			<span>{entry.label}</span>
		</span>
	);
}
/** Noninteractive repository/team legends with explicit unavailable and unsynchronized states. */
export function DashboardSidebar({
	state,
	repositories,
	boards,
}: {
	state: DashboardState;
	repositories: LegendEntry[];
	boards: LegendEntry[];
}) {
	let boardStatus = 'Team boards not synchronized yet.';
	if (state.ado.boardScopes.some((scope) => scope.error)) {
		boardStatus = 'Team board mapping unavailable.';
	} else if (state.ado.boardScopes.some((scope) => scope.successAt && !scope.stale)) {
		boardStatus = 'No team boards in your memberships.';
	}
	return (
		<aside className="sidebar">
			<Link className="brand" href="/">
				<span className="logo">D</span> DevDesk
			</Link>
			<p className="eyebrow mt-8">Workspace</p>
			<div className="nav-item">Overview</div>
			<div className="scope-legends">
				<section aria-label="PR repository legend">
					<h2 className="eyebrow">PR repositories</h2>
					<ul className="space-y-2">
						{repositories.map((entry) => (
							<li key={entry.id}>
								<ScopeLabel entry={entry} />
							</li>
						))}
					</ul>
				</section>
				<section aria-label="Team board legend">
					<h2 className="eyebrow">My team boards</h2>
					<ul className="space-y-2">
						{boards.map((entry) => (
							<li key={entry.id}>
								<ScopeLabel entry={entry} />
							</li>
						))}
					</ul>
					{!boards.length && <p className="text-xs">{boardStatus}</p>}
					<p className="mt-3 text-[10px]">
						Area-path scopes, not board columns. Multiple matches are shown.
					</p>
				</section>
			</div>
			<p className="mt-8 text-xs">
				Local workspace
				<br />
				Stored on your machine
			</p>
		</aside>
	);
}
