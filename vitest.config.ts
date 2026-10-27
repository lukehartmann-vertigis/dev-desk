import { defineConfig } from 'vitest/config';

/** Runs colocated application tests in isolated workers, without opting into live model/API calls. */
export default defineConfig({ test: { include: ['src/**/*.test.ts'], pool: 'forks' } });
