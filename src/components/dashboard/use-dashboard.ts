'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
	dashboardSchema,
	referenceSchema,
	referenceUrl,
	type Approval,
	type ConversationSummary,
	type DashboardState,
	type Mutation,
	type Reference,
	type Todo,
} from '../../lib/contracts';
import { formatTimestamp } from '../../lib/format';
import { api, headers, type ClientCommand } from './api';

const streamEventSchema = z.object({
	type: z.string(),
	text: z.string().optional(),
	message: z.string().optional(),
	conversationId: z.string().optional(),
});

/**
 * Owns dashboard I/O, the selected chat, retry identities and controlled forms.
 * Polls only local state, cancels chat on page exit, and preserves input on failed writes.
 * Responses for a previously selected chat are discarded instead of replacing the view.
 * Consumers must use the exposed actions rather than bypass pending/cleanup guards.
 */
export function useDashboard() {
	const [state, setState] = useState<DashboardState | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [title, setTitle] = useState('');
	const [prompt, setPrompt] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [streamed, setStreamed] = useState('');
	const [drawer, setDrawer] = useState(false);
	const [editing, setEditing] = useState<Todo | null>(null);
	const [deleting, setDeleting] = useState<Todo | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [editLink, setEditLink] = useState('');
	const [removingChat, setRemovingChat] = useState<ConversationSummary | null>(null);
	const [approval, setApproval] = useState<(Approval & { conversationId: string }) | null>(null);
	const [focusMessage, setFocusMessage] = useState<string | null>(null);
	const clearFocus = useCallback(() => setFocusMessage(null), []);
	const [referenceStatus, setReferenceStatus] = useState<Record<string, string>>({});
	const requests = useRef(new Map<string, string>());
	const actionPending = useRef(false);
	const abort = useRef<AbortController | null>(null);
	const input = useRef<HTMLInputElement>(null);
	const selected = useRef<{ id: string | null; version: number }>({ id: null, version: 0 });
	const select = useCallback((id: string | null) => {
		selected.current = { id, version: selected.current.version + 1 };
	}, []);
	// Requests issued before the latest selection change are discarded on arrival.
	const fetchState = useCallback(async (path: string, value?: unknown) => {
		const { id, version } = selected.current;
		const scoped = id ? `${path}?conversation=${encodeURIComponent(id)}` : path;
		return { value: await api(scoped, dashboardSchema, value), version };
	}, []);
	const accept = useCallback(
		({ value, version }: { value: DashboardState; version: number }) => {
			const current = selected.current;
			if (version !== current.version) {
				return;
			}
			if (value.conversationId !== current.id) {
				if (current.id === null || value.conversationId !== null) {
					return;
				}
				select(null);
			}
			setState(value);
		},
		[select],
	);
	const load = useCallback(async () => {
		try {
			accept(await fetchState('state'));
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Could not load the workspace.');
		}
	}, [accept, fetchState]);
	useEffect(() => {
		let mounted = true;
		const parameters = new URLSearchParams(window.location.search);
		const requested = z.uuid().safeParse(parameters.get('conversation'));
		const message = z.uuid().safeParse(parameters.get('message'));
		if (requested.success) {
			select(requested.data);
			if (message.success) {
				setFocusMessage(message.data);
			}
		}
		void fetchState('state')
			.then((response) => {
				if (!mounted) {
					return;
				}
				accept(response);
				const latest = response.value.conversations[0];
				if (!requested.success && latest && selected.current.version === response.version) {
					select(latest.id);
					void load();
				}
			})
			.catch((failure: unknown) => {
				if (mounted) {
					setError(
						failure instanceof Error
							? failure.message
							: 'Could not load the workspace.',
					);
				}
			});
		const timer = setInterval(() => {
			if (!document.hidden) {
				void load();
			}
		}, 15000);
		const focus = () => {
			if (!document.hidden) {
				void load();
			}
		};
		document.addEventListener('visibilitychange', focus);
		window.addEventListener('focus', focus);
		const leave = () => {
			if (!abort.current) {
				return;
			}
			abort.current.abort();
			void fetch('/api/chat/cancel', {
				method: 'POST',
				headers,
				body: '{}',
				keepalive: true,
			}).catch(() =>
				console.error(
					'Could not deliver chat cancellation. The server run deadline remains active.',
				),
			);
		};
		window.addEventListener('pagehide', leave);
		return () => {
			mounted = false;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', focus);
			window.removeEventListener('focus', focus);
			window.removeEventListener('pagehide', leave);
			leave();
		};
	}, [accept, fetchState, load, select]);
	useEffect(() => {
		if (!state?.copilot.running && !state?.ado.running && !streaming) {
			return;
		}
		const timer = setInterval(() => {
			if (!document.hidden) {
				void load();
			}
		}, 1000);
		return () => clearInterval(timer);
	}, [state?.copilot.running, state?.ado.running, streaming, load]);

	async function action(path: string, value: unknown) {
		if (actionPending.current) {
			return false;
		}
		actionPending.current = true;
		setBusy(true);
		setError('');
		try {
			accept(await fetchState(path, value));
			return true;
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'The operation failed.');
			await load();
			return false;
		} finally {
			actionPending.current = false;
			setBusy(false);
		}
	}

	async function mutate(command: ClientCommand<Mutation>) {
		const key = JSON.stringify(command);
		const requestId = requests.current.get(key) ?? crypto.randomUUID();
		requests.current.set(key, requestId);
		const ok = await action('todos', { ...command, requestId });
		if (ok) {
			requests.current.delete(key);
		}
		return ok;
	}

	async function create(event: FormEvent) {
		event.preventDefault();
		if (busy) {
			return;
		}
		if (await mutate({ kind: 'create', title: title.trim(), reference: null })) {
			setTitle('');
			input.current?.focus();
		}
	}

	async function saveEdit(event: FormEvent) {
		event.preventDefault();
		if (!editing || !state || busy) {
			return;
		}
		let reference = editing.reference;
		const previous = reference ? referenceUrl(reference) : '';
		try {
			if (editLink.trim() !== previous) {
				reference = editLink.trim()
					? (
							await api('reference', z.object({ reference: referenceSchema }), {
								url: editLink.trim(),
							})
						).reference
					: null;
			}
			if (
				await mutate({
					kind: 'edit',
					id: editing.id,
					revision: editing.revision,
					title: editTitle.trim(),
					reference,
				})
			) {
				setEditing(null);
			}
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : 'Invalid reference.');
		}
	}

	function edit(todo: Todo) {
		setEditing(todo);
		setEditTitle(todo.title);
		setEditLink(todo.reference ? referenceUrl(todo.reference) : '');
	}

	async function reorder(id: string, target: number) {
		if (!state || busy) {
			return;
		}
		const ids = state.todos.items.filter((todo) => !todo.completedAt).map((todo) => todo.id);
		const index = ids.indexOf(id);
		if (index < 0 || target < 0 || target >= ids.length || index === target) {
			return;
		}
		ids.splice(index, 1);
		ids.splice(target, 0, id);
		await mutate({ kind: 'reorder', listRevision: state.todos.revision, ids });
	}

	async function send(event: FormEvent) {
		event.preventDefault();
		if (
			abort.current ||
			streaming ||
			state?.copilot.state !== 'ready' ||
			state.copilot.running ||
			state.copilot.cleanupPending ||
			!prompt.trim()
		) {
			return;
		}
		setError('');
		setStreaming(true);
		setStreamed('');
		const controller = new AbortController();
		abort.current = controller;
		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					prompt,
					requestId: crypto.randomUUID(),
					...(selected.current.id ? { conversationId: selected.current.id } : {}),
				}),
				signal: controller.signal,
			});
			if (!response.ok) {
				throw new Error(z.object({ error: z.string() }).parse(await response.json()).error);
			}
			setPrompt('');
			await load();
			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('The response stream is unavailable.');
			}
			const decoder = new TextDecoder();
			let buffer = '';
			let finished = false;
			for (;;) {
				const part = await reader.read();
				if (part.done) {
					if (!finished) {
						throw new Error(
							'The response stream ended before completion. Stored results remain available.',
						);
					}
					break;
				}
				buffer += decoder.decode(part.value, { stream: true });
				let newline: number;
				while ((newline = buffer.indexOf('\n')) >= 0) {
					const value = streamEventSchema.parse(JSON.parse(buffer.slice(0, newline)));
					buffer = buffer.slice(newline + 1);
					if (
						value.type === 'started' &&
						value.conversationId &&
						value.conversationId !== selected.current.id
					) {
						select(value.conversationId);
						void load();
					}
					if (value.text !== undefined) {
						setStreamed(value.text);
					}
					if (value.type === 'complete' || value.type === 'error') {
						finished = true;
					}
					if (value.type === 'error') {
						setError(value.message ?? 'The assistant run failed.');
					}
				}
			}
		} catch (failure) {
			const message = failure instanceof Error ? failure.message : 'The chat stream failed.';
			setError(
				controller.signal.aborted
					? 'Run cancelled. Committed changes remain saved.'
					: message,
			);
		} finally {
			abort.current = null;
			setStreaming(false);
			await load();
		}
	}

	function cancel() {
		abort.current?.abort();
		void action('chat/cancel', {});
	}

	/** Shows another saved chat (or a new draft when null) without deleting the current one. */
	function openChat(id: string | null) {
		if (abort.current || state?.copilot.running) {
			return;
		}
		select(id);
		setState((old) => old && { ...old, conversationId: id, chat: [], approvals: [] });
		void load();
	}

	async function removeChat(target: ConversationSummary) {
		if (await action('chat/remove', { conversationId: target.id, confirmed: true })) {
			if (selected.current.id === target.id) {
				openChat(null);
			}
			setRemovingChat(null);
		}
	}

	async function checkReference(reference: Reference) {
		const key = JSON.stringify(reference);
		setReferenceStatus((old) => ({ ...old, [key]: 'Checking...' }));
		try {
			const result = await api(
				'reference/check',
				z.object({ checkedAt: z.string() }),
				reference,
			);
			setReferenceStatus((old) => ({
				...old,
				[key]: `Verified ${formatTimestamp(result.checkedAt)}`,
			}));
		} catch (failure) {
			setReferenceStatus((old) => ({
				...old,
				[key]: `Unavailable: ${failure instanceof Error ? failure.message : 'Reference check failed.'}`,
			}));
		}
	}
	return {
		state,
		error,
		setError,
		busy,
		title,
		setTitle,
		prompt,
		setPrompt,
		streaming,
		streamed,
		drawer,
		setDrawer,
		editing,
		setEditing,
		deleting,
		setDeleting,
		editTitle,
		setEditTitle,
		editLink,
		setEditLink,
		removingChat,
		setRemovingChat,
		removeChat,
		openChat,
		approval,
		setApproval,
		focusMessage,
		clearFocus,
		referenceStatus,
		input,
		load,
		action,
		mutate,
		create,
		saveEdit,
		edit,
		reorder,
		send,
		cancel,
		checkReference,
	};
}
