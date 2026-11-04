'use client';
import { useState } from 'react';

const messages = {
	idle: '',
	copied: 'Copied.',
	failed: 'Copy failed. Select the text below and copy it manually.',
};

/**
 * Copies the exact supplied text through the browser clipboard.
 * Success is announced only after the write resolves; denial or absence shows a visible error.
 */
export function CopyButton({ text, label }: { text: string; label: string }) {
	const [status, setStatus] = useState<keyof typeof messages>('idle');

	async function copy() {
		setStatus('idle');
		try {
			if (!navigator.clipboard) {
				throw new Error('Clipboard unavailable');
			}
			await navigator.clipboard.writeText(text);
			setStatus('copied');
		} catch {
			setStatus('failed');
		}
	}
	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<button type="button" onClick={() => void copy()}>
				{label}
			</button>
			<span
				role="status"
				className={status === 'failed' ? 'text-xs text-[#f1c5c5]' : 'text-xs'}
			>
				{messages[status]}
			</span>
		</span>
	);
}
