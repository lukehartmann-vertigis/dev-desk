import type { NextConfig } from 'next';

/** Keeps native services server-side and applies shared browser response headers. */
export default {
	serverExternalPackages: ['better-sqlite3', '@github/copilot-sdk'],
	poweredByHeader: false,
	/** Applies the local application's content, framing and referrer policy to every route. */
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'no-referrer' },
					{ key: 'X-Frame-Options', value: 'DENY' },
					{
						key: 'Content-Security-Policy',
						value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
					},
				],
			},
		];
	},
} satisfies NextConfig;
