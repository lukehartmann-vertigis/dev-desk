import type { Metadata } from 'next';
import './globals.css';

/** Static page metadata; contains no user, integration, or provider state. */
export const metadata: Metadata = {
	title: 'DevDesk',
	description: 'Your local developer workspace',
};

/** Provides the English document shell and shared dark-first styles without starting services. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
