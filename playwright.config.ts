import { defineConfig } from '@playwright/test';

/** Serial browser workflows; mutating runs must target an isolated instance via DEVDESK_TEST_URL. */
export default defineConfig({
	testDir: './tests/e2e',
	workers: 1,
	use: {
		baseURL: process.env.DEVDESK_TEST_URL ?? 'http://127.0.0.1:3000',
		trace: 'retain-on-failure',
	},
});
