'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { referenceUrl, type DashboardState } from '../../lib/contracts';

/**
 * Renders saved or streaming assistant text as GFM, and user text literally.
 * Raw HTML and remote images never render; only exact known todo/cache source URLs become links.
 */
export function MessageContent({
	text,
	role,
	state,
}: {
	text: string;
	role: 'user' | 'assistant';
	state: DashboardState;
}) {
	const allowed = new Set([
		...state.todos.items.flatMap((todo) =>
			todo.reference ? [referenceUrl(todo.reference)] : [],
		),
		...state.ado.snapshots.flatMap((scope) => scope.data.map((row) => row.url)),
	]);
	if (role === 'assistant') {
		return (
			<div className="message-markdown">
				<Markdown
					remarkPlugins={[remarkGfm]}
					skipHtml
					urlTransform={(url) =>
						url.startsWith('https://dev.azure.com/') && allowed.has(url)
							? url
							: undefined
					}
					components={{
						a: ({ href, children }) =>
							href ? (
								<a href={href} target="_blank" rel="noopener noreferrer">
									{children}
								</a>
							) : (
								<>{children}</>
							),
						img: ({ alt }) => <span>{alt}</span>,
						table: ({ children }) => (
							<div className="markdown-table">
								<table>{children}</table>
							</div>
						),
					}}
				>
					{text}
				</Markdown>
			</div>
		);
	}
	return (
		<div className="break-words whitespace-pre-wrap">
			{text.split(/(https:\/\/dev\.azure\.com\/[^\s<>"'`]+)/g).map((part, index) =>
				allowed.has(part) ? (
					<a key={index} href={part} target="_blank" rel="noopener noreferrer">
						{part}
					</a>
				) : (
					part
				),
			)}
		</div>
	);
}
