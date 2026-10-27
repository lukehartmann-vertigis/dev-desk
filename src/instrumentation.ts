/** Next.js startup hook; initializes services only in serving Node processes, never build workers. */
export async function register() {
	if (
		process.env.NEXT_RUNTIME === 'nodejs' &&
		process.env.NEXT_PHASE !== 'phase-production-build'
	) {
		const { startRuntime } = await import('./server/runtime');
		startRuntime();
	}
}
