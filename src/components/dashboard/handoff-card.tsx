'use client';
import Link from 'next/link';
import type { ChatHandoff } from '../../lib/contracts';
import { CopyButton } from '../copy-button';

/**
 * Chat reference to one exact stored handoff version, copyable without leaving the chat.
 * A removed artifact renders as explicitly unavailable instead of a retained copy.
 */
export function HandoffCard({ handoff }: { handoff: ChatHandoff }) {
	if (handoff.state === 'unavailable') {
		return (
			<p className="notice text-xs">
				This planning handoff was deleted and is no longer available.
			</p>
		);
	}
	return (
		<section className="handoff-card" aria-label={`Planning handoff: ${handoff.title}`}>
			<p className="eyebrow">Planning handoff · version {handoff.version}</p>
			<h3 className="break-words">{handoff.title}</h3>
			<div className="mt-3 flex flex-wrap items-center gap-2">
				<CopyButton text={handoff.markdown} label="Copy handoff" />
				<Link
					href={`/handoffs?handoff=${handoff.handoffId}&version=${handoff.versionId}`}
					className="text-xs"
				>
					Open in Handoffs
				</Link>
			</div>
			<details className="mt-2">
				<summary className="text-xs">Show full text</summary>
				<pre className="handoff-text">{handoff.markdown}</pre>
			</details>
		</section>
	);
}
