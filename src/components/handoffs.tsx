'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import {
	handoffDetailSchema,
	handoffListSchema,
	referenceUrl,
	type HandoffDetail,
	type HandoffSummary,
	type HandoffVersion,
} from '../lib/contracts';
import { formatTimestamp } from '../lib/format';
import { AppShell } from './app-shell';
import { CopyButton } from './copy-button';
import { api } from './dashboard/api';
import { Modal } from './dashboard/modal';

function ticket(entry: Pick<HandoffSummary['latest'], 'reference'>) {
	return `#${entry.reference.id} · ${entry.reference.project}`;
}

function matches(entry: HandoffSummary, query: string) {
	const text = query.trim().toLowerCase().replace(/^#/, '');
	if (!text) {
		return true;
	}
	return [entry.latest.title, String(entry.latest.reference.id), entry.latest.reference.project]
		.join(' ')
		.toLowerCase()
		.includes(text);
}

function Provenance({ version }: { version: HandoffVersion }) {
	if (!version.conversationId) {
		return <p className="text-xs">The source chat was deleted; this saved snapshot remains.</p>;
	}
	const message = version.originMessageId ? `&message=${version.originMessageId}` : '';
	return (
		<Link className="text-xs" href={`/?conversation=${version.conversationId}${message}`}>
			Open the requesting chat message
		</Link>
	);
}

/**
 * Independent overview of saved planning handoffs with exact-version copy and confirmed removal.
 * Reads local storage only; saved snapshots do not prove current ticket state or access.
 */
export function Handoffs() {
	const [list, setList] = useState<HandoffSummary[] | null>(null);
	const [listError, setListError] = useState('');
	const [query, setQuery] = useState('');
	const [selected, setSelected] = useState<string | null>(null);
	const [detail, setDetail] = useState<HandoffDetail | null>(null);
	const [detailError, setDetailError] = useState('');
	const [versionId, setVersionId] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);
	const [deleteError, setDeleteError] = useState('');
	const requested = useRef<string | null>(null);
	const versionField = useId();
	const listLoaded = useCallback((value: HandoffSummary[]) => {
		setList(value);
		setListError('');
	}, []);
	const listFailed = useCallback((failure: unknown) => {
		setListError(failure instanceof Error ? failure.message : 'Could not load handoffs.');
	}, []);
	const detailLoaded = useCallback((id: string, value: HandoffDetail, version: string | null) => {
		if (requested.current !== id) {
			return;
		}
		setSelected(id);
		setDetail(value);
		const exact = value.versions.find((entry) => entry.id === version);
		setVersionId((exact ?? value.versions.at(-1))?.id ?? null);
	}, []);
	const detailFailed = useCallback((id: string, failure: unknown) => {
		if (requested.current === id) {
			setSelected(id);
			setDetailError(
				failure instanceof Error ? failure.message : 'Could not load this handoff.',
			);
		}
	}, []);
	const fetchList = useCallback(
		() => api('handoffs', handoffListSchema).then(listLoaded, listFailed),
		[listLoaded, listFailed],
	);
	const fetchDetail = useCallback(
		(id: string, version: string | null) =>
			api(`handoffs/${id}`, handoffDetailSchema).then(
				(value) => detailLoaded(id, value, version),
				(failure: unknown) => detailFailed(id, failure),
			),
		[detailLoaded, detailFailed],
	);
	const open = useCallback(
		(id: string, version: string | null = null) => {
			requested.current = id;
			setSelected(id);
			setDetail(null);
			setDetailError('');
			void fetchDetail(id, version);
		},
		[fetchDetail],
	);
	useEffect(() => {
		const parameters = new URLSearchParams(window.location.search);
		const handoff = z.uuid().safeParse(parameters.get('handoff'));
		const version = z.uuid().safeParse(parameters.get('version'));
		void api('handoffs', handoffListSchema).then(listLoaded, listFailed);
		if (handoff.success) {
			const id = handoff.data;
			requested.current = id;
			void api(`handoffs/${id}`, handoffDetailSchema).then(
				(value) => detailLoaded(id, value, version.success ? version.data : null),
				(failure: unknown) => detailFailed(id, failure),
			);
		}
	}, [detailFailed, detailLoaded, listFailed, listLoaded]);
	const visible = list?.filter((entry) => matches(entry, query)) ?? [];
	const version = detail?.versions.find((entry) => entry.id === versionId);
	const latest = detail?.versions.at(-1);

	async function remove() {
		if (!detail || !latest) {
			return;
		}
		setBusy(true);
		setDeleteError('');
		try {
			setList(
				await api('handoffs/delete', handoffListSchema, {
					handoffId: detail.id,
					latestVersion: latest.version,
					confirmed: true,
				}),
			);
			setConfirming(false);
			requested.current = null;
			setSelected(null);
			setDetail(null);
		} catch (failure) {
			setDeleteError(failure instanceof Error ? failure.message : 'Could not delete.');
			void fetchList();
			open(detail.id, versionId);
		} finally {
			setBusy(false);
		}
	}
	return (
		<AppShell active="handoffs">
			<main className="main-content" aria-label="Handoffs content" tabIndex={0}>
				<header className="mb-6">
					<p className="eyebrow">YOUR LOCAL WORKSPACE</p>
					<h1>Planning handoffs</h1>
					<p>
						Saved planning requests for other workspaces. Copy one into the target
						repository&apos;s chat; it asks for planning only.
					</p>
				</header>
				<div className="handoffs-layout">
					<section className="card p-4" aria-label="Saved handoffs">
						<input
							type="search"
							aria-label="Search handoffs"
							placeholder="Search by ticket or title"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="mb-3 w-full"
						/>
						{listError && (
							<div role="alert" className="notice error">
								<p>{listError}</p>
								<button className="mt-2" onClick={() => void fetchList()}>
									Retry
								</button>
							</div>
						)}
						{!list && !listError && <p role="status">Loading handoffs...</p>}
						{list && !list.length && (
							<p className="text-sm">
								No saved handoffs yet. Ask the assistant to prepare a planning
								handoff for a work item.
							</p>
						)}
						{list && list.length > 0 && !visible.length && (
							<p className="text-sm">No handoffs match your search.</p>
						)}
						<ul>
							{visible.map((entry) => (
								<li key={entry.id}>
									<button
										type="button"
										className="handoff-entry"
										aria-current={entry.id === selected ? 'true' : undefined}
										onClick={() => open(entry.id)}
									>
										<span className="break-words">{entry.latest.title}</span>
										<span className="text-xs text-[var(--muted)]">
											{ticket(entry.latest)} · version {entry.latest.version}{' '}
											· {formatTimestamp(entry.updatedAt)}
										</span>
									</button>
								</li>
							))}
						</ul>
					</section>
					<section className="card min-w-0 p-5" aria-label="Handoff detail">
						{!selected && <p>Select a handoff to read or copy it.</p>}
						{selected && !detail && !detailError && (
							<p role="status">Loading handoff...</p>
						)}
						{detailError && (
							<p role="alert" className="notice error">
								{detailError}
							</p>
						)}
						{detail && version && (
							<>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="eyebrow">{ticket(version)}</p>
										<h2 className="break-words">{version.title}</h2>
									</div>
									<button
										type="button"
										className="danger"
										onClick={() => {
											setDeleteError('');
											setConfirming(true);
										}}
									>
										Delete handoff
									</button>
								</div>
								<div className="mt-4 text-sm">
									<label htmlFor={versionField}>Version</label>
									<select
										id={versionField}
										className="ml-2"
										value={version.id}
										onChange={(event) => setVersionId(event.target.value)}
									>
										{detail.versions.map((entry) => (
											<option key={entry.id} value={entry.id}>
												Version {entry.version} ·{' '}
												{formatTimestamp(entry.createdAt)}
											</option>
										))}
									</select>
								</div>
								<p className="mt-3 text-xs">
									Saved snapshot; ticket retrieved{' '}
									{formatTimestamp(version.retrievedAt)}. It does not reflect
									later ticket changes or current access.{' '}
									<a
										href={referenceUrl(version.reference)}
										target="_blank"
										rel="noopener noreferrer"
									>
										Open work item
									</a>
								</p>
								<div className="mt-2">
									<Provenance version={version} />
								</div>
								<div className="mt-4">
									<CopyButton text={version.markdown} label="Copy handoff" />
								</div>
								<pre className="handoff-text" aria-label="Handoff text">
									{version.markdown}
								</pre>
							</>
						)}
					</section>
				</div>
			</main>
			{confirming && detail && latest && (
				<Modal title="Delete handoff?" close={() => setConfirming(false)} busy={busy}>
					<div className="p-5">
						<p className="break-words">
							Delete &quot;{latest.title}&quot; and all {detail.versions.length} saved
							version{detail.versions.length === 1 ? '' : 's'}?
						</p>
						<p className="mt-3 text-xs">
							Chats keep their messages, but their references will show this handoff
							as unavailable. Copied text and old backups are not affected.
						</p>
						{deleteError && (
							<p role="alert" className="notice error mt-3">
								{deleteError}
							</p>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setConfirming(false)}>
								Cancel
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={() => void remove()}
							>
								Delete handoff
							</button>
						</div>
					</div>
				</Modal>
			)}
		</AppShell>
	);
}
