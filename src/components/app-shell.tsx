import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shares navigation and layout without sharing page controllers or extending chat lifetime. */
export function AppShell({
	active,
	sidebar,
	chat,
	children,
}: {
	active: 'overview' | 'settings';
	sidebar?: ReactNode;
	chat?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className={chat ? 'app-shell app-shell-with-chat' : 'app-shell'}>
			<aside className="sidebar">
				<Link className="brand" href="/">
					<span className="logo">D</span> DevDesk
				</Link>
				<p className="eyebrow mt-8">Workspace</p>
				<nav className="workspace-nav" aria-label="Workspace">
					{[
						{ id: 'overview', href: '/', label: 'Overview' },
						{ id: 'settings', href: '/settings', label: 'Settings' },
					].map(({ id, href, label }) => (
						<Link
							key={id}
							className="nav-item"
							href={href}
							aria-current={active === id ? 'page' : undefined}
						>
							{label}
						</Link>
					))}
				</nav>
				{sidebar}
				<p className="mt-8 text-xs">
					Local workspace
					<br />
					Stored on your machine
				</p>
			</aside>
			{children}
			{chat && <aside className="desktop-chat">{chat}</aside>}
		</div>
	);
}
