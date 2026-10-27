'use client';
import type { useDashboard } from './use-dashboard';
import { Modal } from './modal';
import { formatTimestamp } from '../../lib/format';
type DialogProps = Pick<
	ReturnType<typeof useDashboard>,
	| 'editing'
	| 'setEditing'
	| 'editTitle'
	| 'setEditTitle'
	| 'editLink'
	| 'setEditLink'
	| 'busy'
	| 'saveEdit'
	| 'deleting'
	| 'setDeleting'
	| 'mutate'
	| 'approval'
	| 'setApproval'
	| 'action'
	| 'clearChat'
	| 'setClearChat'
>;
/** Controlled edit/deletion/clear confirmations; closes only after the controller commits success. */
export function DashboardDialogs({
	editing,
	setEditing,
	editTitle,
	setEditTitle,
	editLink,
	setEditLink,
	busy,
	saveEdit,
	deleting,
	setDeleting,
	mutate,
	approval,
	setApproval,
	action,
	clearChat,
	setClearChat,
}: DialogProps) {
	return (
		<>
			{editing && (
				<Modal title="Edit todo" close={() => setEditing(null)} busy={busy}>
					<form onSubmit={saveEdit} className="space-y-4 p-5">
						<label className="block">
							Title
							<input
								aria-label="Todo title"
								value={editTitle}
								onChange={(event) => setEditTitle(event.target.value)}
								required
								disabled={busy}
								className="mt-2 w-full"
							/>
						</label>
						<label className="block">
							External reference (optional)
							<input
								aria-label="External reference"
								type="url"
								value={editLink}
								onChange={(event) => setEditLink(event.target.value)}
								placeholder="https://dev.azure.com/..."
								className="mt-2 w-full"
							/>
						</label>
						<p className="text-xs">
							Only configured Azure DevOps projects/repositories are allowed.
							References are labelled unverified until checked upstream.
						</p>
						<div className="flex justify-end gap-2">
							<button type="button" onClick={() => setEditing(null)} disabled={busy}>
								Cancel
							</button>
							<button className="primary" disabled={busy}>
								Save
							</button>
						</div>
					</form>
				</Modal>
			)}
			{deleting && (
				<Modal title="Delete todo?" close={() => setDeleting(null)} busy={busy}>
					<div className="p-5">
						<p className="break-words">
							Permanently delete &quot;{deleting.title}&quot;?
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setDeleting(null)}>
								Cancel
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (
										await mutate({
											kind: 'delete',
											id: deleting.id,
											revision: deleting.revision,
										})
									) {
										setDeleting(null);
									}
								}}
							>
								Delete permanently
							</button>
						</div>
					</div>
				</Modal>
			)}
			{approval && (
				<Modal
					title="Confirm assistant deletion"
					close={() => setApproval(null)}
					busy={busy}
				>
					<div className="p-5">
						<p className="break-words">
							Delete &quot;{approval.title}&quot; at revision {approval.revision}?
						</p>
						<p className="mt-2 text-xs">
							This approval applies to this exact todo version and expires{' '}
							{formatTimestamp(approval.expiresAt)}.
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button
								disabled={busy}
								onClick={async () => {
									if (
										await action('approval', {
											id: approval.id,
											accept: false,
											requestId: crypto.randomUUID(),
										})
									) {
										setApproval(null);
									}
								}}
							>
								Reject
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (
										await action('approval', {
											id: approval.id,
											accept: true,
											requestId: crypto.randomUUID(),
										})
									) {
										setApproval(null);
									}
								}}
							>
								Confirm deletion
							</button>
						</div>
					</div>
				</Modal>
			)}
			{clearChat && (
				<Modal title="Clear conversation?" close={() => setClearChat(false)} busy={busy}>
					<div className="p-5">
						<p>
							This cancels active work and removes local messages, tool outcomes,
							approvals, and SDK conversation state. Todos remain saved.
						</p>
						<p className="mt-3 text-xs">
							Old backups and GitHub retention are not affected. Incomplete cleanup is
							reported and can be retried.
						</p>
						<div className="mt-5 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setClearChat(false)}>
								Cancel
							</button>
							<button
								className="danger"
								disabled={busy}
								onClick={async () => {
									if (await action('chat/clear', { confirmed: true })) {
										setClearChat(false);
									}
								}}
							>
								Clear conversation
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}
