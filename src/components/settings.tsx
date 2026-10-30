'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
	saveSettingsSchema,
	settingsResponseSchema,
	sourceCatalogSchema,
	type SaveSettings,
	type Source,
	type SourceCatalog,
	type SourceSettings,
} from '../lib/contracts';
import { api } from './dashboard/api';
import { AppShell } from './app-shell';

type SettingsResponse = z.infer<typeof settingsResponseSchema>;
type SourceKind = 'boards' | 'repositories';

function draftFrom(settings: SourceSettings): SaveSettings {
	return {
		revision: settings.revision,
		boards: settings.boards.map(({ id, projectId }) => ({ id, projectId })),
		repositories: settings.repositories.map(({ id, projectId }) => ({ id, projectId })),
	};
}

/** Persistent source selection with explicit drafts; provider discovery cannot change checked IDs. */
export function Settings() {
	const [saved, setSaved] = useState<SettingsResponse | null>(null);
	const [draft, setDraft] = useState<SaveSettings | null>(null);
	const [catalog, setCatalog] = useState<SourceCatalog | null>(null);
	const [discovering, setDiscovering] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const savePending = useRef(false);
	const discoveryAbort = useRef<AbortController | null>(null);

	async function discover(signal?: AbortSignal) {
		discoveryAbort.current?.abort();
		const controller = new AbortController();
		discoveryAbort.current = controller;
		const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
		setDiscovering(true);
		try {
			const result = await api('settings/catalog', sourceCatalogSchema, {}, combined);
			if (!combined.aborted) {
				setCatalog(result);
			}
		} catch (failure) {
			if (!combined.aborted) {
				setError(
					failure instanceof Error
						? failure.message
						: 'Could not discover Azure DevOps sources.',
				);
			}
		} finally {
			if (!combined.aborted) {
				setDiscovering(false);
			}
		}
	}

	useEffect(() => {
		const controller = new AbortController();
		void api('settings', settingsResponseSchema, undefined, controller.signal)
			.then(async (result) => {
				if (controller.signal.aborted) {
					return;
				}
				setSaved(result);
				setDraft(draftFrom(result.settings));
				if (result.connection.state === 'ready') {
					await discover(controller.signal);
				}
			})
			.catch((failure: unknown) => {
				if (!controller.signal.aborted) {
					setError(
						failure instanceof Error ? failure.message : 'Could not load settings.',
					);
				}
			});
		return () => {
			controller.abort();
			discoveryAbort.current?.abort();
		};
	}, []);

	async function reload() {
		setError('');
		setNotice('');
		try {
			const result = await api('settings', settingsResponseSchema);
			setSaved(result);
			setDraft(draftFrom(result.settings));
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Could not load settings.');
		}
	}

	async function save() {
		if (!draft || savePending.current) {
			return;
		}
		savePending.current = true;
		setSaving(true);
		setError('');
		setNotice('');
		try {
			const result = await api(
				'settings',
				settingsResponseSchema,
				saveSettingsSchema.parse(draft),
			);
			setSaved(result);
			setDraft(draftFrom(result.settings));
			setNotice('Sources saved.');
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Could not save settings.');
		} finally {
			savePending.current = false;
			setSaving(false);
		}
	}

	function toggle(kind: SourceKind, source: Source, checked: boolean) {
		setDraft(
			(current) =>
				current && {
					...current,
					[kind]: checked
						? [...current[kind], { id: source.id, projectId: source.projectId }]
						: current[kind].filter((entry) => entry.id !== source.id),
				},
		);
		setNotice('');
	}

	const dirty =
		saved && draft && JSON.stringify(draft) !== JSON.stringify(draftFrom(saved.settings));
	return (
		<AppShell active="settings">
			<main className="main-content" aria-label="Settings content" tabIndex={0}>
				<div className="mx-auto max-w-5xl">
					<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
						<div>
							<p className="eyebrow">YOUR LOCAL WORKSPACE</p>
							<h1>Settings</h1>
							<p>Choose the Azure DevOps sources available throughout DevDesk.</p>
						</div>
						<Link href="/">Back to workspace</Link>
					</header>
					{error && (
						<div role="alert" className="notice error mb-5">
							<p>{error}</p>
							<button
								className="mt-2"
								disabled={saving}
								onClick={() => void reload()}
							>
								Reload saved selection
							</button>
						</div>
					)}
					{!saved && !error && <p role="status">Loading settings...</p>}
					{saved && draft && (
						<>
							{saved.settings.revision === 0 && (
								<p className="notice mb-5">
									No sources are enabled by default, including after an upgrade.
									Choose sources below and save.
								</p>
							)}
							<section className="card p-5" aria-label="Azure DevOps connection">
								<h2>Azure DevOps · {saved.settings.organization}</h2>
								<p className="mt-2">{saved.connection.message}</p>
								<p className="mt-2">
									Projects group the sources below; there is no separate project
									selection. Credentials stay in the server configuration.
								</p>
								{saved.warnings.map((warning) => (
									<p key={warning} className="mt-2 text-amber-200">
										{warning}
									</p>
								))}
								<button
									className="mt-4"
									disabled={
										discovering || saving || saved.connection.state !== 'ready'
									}
									onClick={() => {
										setError('');
										void discover();
									}}
								>
									{discovering
										? 'Discovering sources...'
										: 'Refresh available sources'}
								</button>
							</section>
							{discovering && (
								<p role="status" className="mb-4">
									Loading accessible projects, team boards, and repositories...
								</p>
							)}
							{catalog?.errors.map((message, index) => (
								<div
									role="alert"
									key={`${index}:${message}`}
									className="notice error mb-3"
								>
									{message}
								</div>
							))}
							{catalog && catalog.errors.length > 0 && (
								<p className="mb-4">
									Discovery is incomplete. Saved selections have not changed.
								</p>
							)}
							<div className="grid items-start gap-5 md:grid-cols-2">
								{(['boards', 'repositories'] as const).map((kind) => (
									<SourceList
										key={kind}
										kind={kind}
										saved={saved.settings[kind]}
										candidates={catalog?.[kind] ?? []}
										selected={draft[kind]}
										pending={saving}
										discovered={catalog !== null}
										incomplete={Boolean(catalog?.errors.length)}
										onToggle={(source, checked) =>
											toggle(kind, source, checked)
										}
									/>
								))}
							</div>
							<div className="mb-6 flex flex-wrap items-center gap-3">
								<button
									className="primary"
									disabled={!dirty || saving}
									onClick={() => void save()}
								>
									{saving ? 'Saving...' : 'Save'}
								</button>
								<button
									disabled={!dirty || saving}
									onClick={() => {
										setDraft(draftFrom(saved.settings));
										setError('');
										setNotice('');
									}}
								>
									Cancel
								</button>
								{notice && <p role="status">{notice}</p>}
							</div>
							<p className="mb-4">
								No Work Item Sources selected means no Azure work items. No
								repositories selected means no pull requests. Local todos and chat
								history are never deleted by these settings.
							</p>
						</>
					)}
				</div>
			</main>
		</AppShell>
	);
}

function SourceList({
	kind,
	saved,
	candidates,
	selected,
	pending,
	discovered,
	incomplete,
	onToggle,
}: {
	kind: SourceKind;
	saved: Source[];
	candidates: Source[];
	selected: SaveSettings[SourceKind];
	pending: boolean;
	discovered: boolean;
	incomplete: boolean;
	onToggle: (source: Source, checked: boolean) => void;
}) {
	const [query, setQuery] = useState('');
	const title = kind === 'boards' ? 'Work Item Sources' : 'Repositories';
	const choices = [
		...new Map([...saved, ...candidates].map((source) => [source.id, source])).values(),
	];
	const visible = choices
		.filter(
			(source) =>
				selected.some((entry) => entry.id === source.id) ||
				`${source.project} ${source.name}`
					.toLowerCase()
					.includes(query.trim().toLowerCase()),
		)
		.sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name));
	const projects = [
		...new Map(visible.map((source) => [source.projectId, source.project])).entries(),
	];
	let emptyMessage = 'No sources loaded. Configure Azure DevOps or refresh discovery.';
	if (query) {
		emptyMessage = 'No matching sources.';
	} else if (incomplete) {
		emptyMessage = 'Discovery is incomplete. Your saved selection has not changed.';
	} else if (discovered) {
		emptyMessage = 'No sources discovered in the accessible projects.';
	}
	return (
		<section className="card min-w-0 p-5" aria-label={title}>
			<h2>
				{title} <span className="badge">{selected.length} selected</span>
			</h2>
			<p className="my-3 text-xs">
				{kind === 'boards'
					? 'Team area scopes from all readable teams, not just your memberships. Shows your assigned work items, not exact board columns or backlogs.'
					: 'Provides your active pull requests and review requests.'}
			</p>
			<label className="block text-xs">
				Search {title}
				<input
					className="mt-2 w-full"
					type="search"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</label>
			<div className="mt-4 max-h-96 space-y-4 overflow-y-auto p-1">
				{projects.map(([id, name]) => (
					<fieldset key={id} disabled={pending}>
						<legend className="mb-2 font-semibold">{name}</legend>
						{visible
							.filter((source) => source.projectId === id)
							.map((source) => {
								const available = candidates.some(
									(candidate) => candidate.id === source.id,
								);
								return (
									<label
										key={source.id}
										className="flex items-start gap-3 rounded-lg px-1 py-2"
									>
										<input
											type="checkbox"
											className="mt-1"
											aria-label={`${source.project} / ${source.name}`}
											checked={selected.some(
												(entry) => entry.id === source.id,
											)}
											onChange={(event) =>
												onToggle(source, event.target.checked)
											}
										/>
										<span className="min-w-0 break-words">
											{source.name}
											{!available && (
												<span className="block text-xs text-amber-200">
													{discovered
														? 'Unavailable in the current discovery; saved selection retained.'
														: 'Saved source; availability not checked.'}
												</span>
											)}
										</span>
									</label>
								);
							})}
					</fieldset>
				))}
				{!visible.length && <p className="text-xs">{emptyMessage}</p>}
			</div>
		</section>
	);
}
