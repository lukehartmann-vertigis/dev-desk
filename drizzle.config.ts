import { defineConfig } from 'drizzle-kit';

/** Generates reviewed SQLite migrations; runtime storage is opened only by the application. */
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/server/schema.ts',
	out: './drizzle',
});
