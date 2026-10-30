import { describe, expect, it, vi } from 'vitest';
import { configuration } from './config';
import { protect } from './http';
import { AppError, safeError } from './errors';
import { dashboardSchema } from '../lib/contracts';

describe('configuration isolation and localhost boundary', () => {
	it('SET-010 treats missing source counts as invalid transport, not a successful empty selection', () => {
		const integration = { state: 'disabled', message: 'Not configured.', running: false };
		const state = {
			todos: { revision: 0, items: [] },
			ado: {
				...integration,
				organization: 'example',
				repositories: [],
				boardScopes: [],
				snapshots: [],
			},
			copilot: { ...integration, cleanupPending: false },
			chat: [],
			approvals: [],
		};
		expect(dashboardSchema.safeParse(state).success).toBe(false);
		expect(
			dashboardSchema.safeParse({
				...state,
				ado: { ...state.ado, selection: { revision: 0, boards: 0, repositories: 0 } },
			}).success,
		).toBe(true);
	});
	it('OPS-005 preserves trusted errors across independent server entry bundles', async () => {
		vi.resetModules();
		const { AppError: OtherAppError } = await import('./errors');
		expect(OtherAppError).not.toBe(AppError);
		const error = new OtherAppError('DISABLED', 'Integration is not configured.', 503);
		expect(safeError(error)).toBe(error);
	});
	it('OPS-002 does not trust or expose an unmarked upstream error', () => {
		const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const error = Object.assign(new Error('Do not expose upstream content'), {
				code: 'UPSTREAM',
				status: 401,
			});
			expect(safeError(error).status).toBe(500);
			expect(safeError(error).message).not.toContain(error.message);
			expect(JSON.stringify(logger.mock.calls)).not.toContain(error.message);
		} finally {
			logger.mockRestore();
		}
	});
	it('OPS-003/SET-010 configures connections without implicitly selecting sources', () => {
		const absent = configuration({});
		expect(absent.adoStatus.state).toBe('disabled');
		expect(absent.copilotStatus.state).toBe('disabled');
		const configured = configuration({
			AZURE_DEVOPS_PAT: 'synthetic',
			COPILOT_GITHUB_TOKEN: 'synthetic',
			DATABASE_PATH: '/data/dashboard.db',
		});
		expect(configured.ado).toMatchObject({ org: 'vertigis', interval: 180 });
		expect(configured.ado).not.toHaveProperty('projects');
		expect(configured.ado).not.toHaveProperty('repositoryIds');
		expect(configured.copilot?.model).toBe('gpt-4.1');
		expect(configured.copilot?.statePath).toBe('/data/copilot');
	});
	it.each([
		{ AZURE_DEVOPS_PAT: 'test', SYNC_INTERVAL_SECONDS: '29' },
		{ AZURE_DEVOPS_PAT: 'test', AZURE_DEVOPS_ORG: 'invalid/org' },
		{ AZURE_DEVOPS_PAT: 'test', AZURE_DEVOPS_ORG: '' },
	])('OPS-003 isolates invalid ADO settings %j', (env) => {
		expect(configuration({ ...env, COPILOT_GITHUB_TOKEN: 'synthetic' }).adoStatus.state).toBe(
			'configuration_error',
		);
		expect(
			configuration({ ...env, COPILOT_GITHUB_TOKEN: 'synthetic' }).copilotStatus.state,
		).toBe('ready');
		expect(configuration(env).adoOrganization.length).toBeGreaterThan(0);
	});
	it('SET-010 reports legacy scope variables as deprecated without treating empty lists as invalid', () => {
		const config = configuration({
			AZURE_DEVOPS_PAT: 'synthetic',
			AZURE_DEVOPS_PROJECTS: '',
			AZURE_DEVOPS_REPOSITORY_IDS: 'not-an-id',
		});
		expect(config.adoStatus.state).toBe('ready');
		expect(config.adoWarnings).toHaveLength(2);
		expect(config.adoWarnings.join(' ')).toContain('ignored');
	});
	it('OPS-003 rejects invalid core storage config rather than creating a replacement', () => {
		expect(() => configuration({ DATABASE_PATH: '' })).toThrow();
		expect(
			configuration({ COPILOT_MODEL: 'model', AZURE_DEVOPS_PAT: 'synthetic' }).copilotStatus
				.state,
		).toBe('configuration_error');
	});
	it('OPS-002 permits only local same-origin JSON mutations with the application header', () => {
		const request = (host: string, origin: string, marker = '1') =>
			new Request('http://localhost:3000/api/todos', {
				method: 'POST',
				headers: {
					host,
					origin,
					'content-type': 'application/json',
					'x-devdesk-request': marker,
				},
			});
		expect(() =>
			protect(request('localhost:3000', 'http://localhost:3000'), 'http://localhost:3000'),
		).not.toThrow();
		expect(() =>
			protect(request('127.0.0.1:3000', 'http://127.0.0.1:3000'), 'http://localhost:3000'),
		).not.toThrow();
		expect(() =>
			protect(request('evil.test:3000', 'http://localhost:3000'), 'http://localhost:3000'),
		).toThrow('host');
		expect(() =>
			protect(request('localhost:3000', 'https://evil.test'), 'http://localhost:3000'),
		).toThrow('Cross-origin');
		expect(() =>
			protect(
				request('localhost:3000', 'http://localhost:3000', ''),
				'http://localhost:3000',
			),
		).toThrow('JSON');
	});
});
