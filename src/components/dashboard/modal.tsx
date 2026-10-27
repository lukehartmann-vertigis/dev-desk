'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
/** Native modal/drawer with labelled focus restoration; busy dialogs cannot dismiss via Escape. */
export function Modal({
	title,
	children,
	close,
	busy = false,
	drawer = false,
}: {
	title: string;
	children: ReactNode;
	close: () => void;
	busy?: boolean;
	drawer?: boolean;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const id = useId();
	useEffect(() => {
		const element = ref.current;
		const trigger = document.activeElement;
		element?.showModal();
		return () => {
			element?.close();
			if (trigger instanceof HTMLElement) {
				trigger.focus();
			}
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby={id}
			className={drawer ? 'modal drawer' : 'modal'}
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) {
					close();
				}
			}}
		>
			<div className="flex items-center justify-between gap-4 border-b border-[var(--line)] p-5">
				<h2 id={id}>{title}</h2>
				<button type="button" onClick={close} disabled={busy} aria-label={`Close ${title}`}>
					Close
				</button>
			</div>
			{children}
		</dialog>
	);
}
