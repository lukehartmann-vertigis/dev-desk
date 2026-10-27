import { describe, expect, it, vi } from 'vitest';
import { configuration } from './config';
import { protect } from './http';
import { AppError, safeError } from './errors';

describe('configuration isolation and localhost boundary', () => {
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
	it('OPS-003 disables absent integrations and requires only tokens for the selected workspace', () => {
		const absent = configuration({});
		expect(absent.adoStatus.state).toBe('disabled');
		expect(absent.copilotStatus.state).toBe('disabled');
		const configured = configuration({
			AZURE_DEVOPS_PAT: 'synthetic',
			COPILOT_GITHUB_TOKEN: 'synthetic',
			DATABASE_PATH: '/data/dashboard.db',
		});
		expect(configured.ado?.projects).toEqual(['Utilities']);
		expect(configured.ado?.repositoryIds).toHaveLength(2);
		expect(configured.copilot?.model).toBe('gpt-4.1');
		expect(configured.copilot?.statePath).toBe('/data/copilot');
	});
	it.each([
		{ AZURE_DEVOPS_PROJECTS: '' },
		{ AZURE_DEVOPS_PAT: 'test', SYNC_INTERVAL_SECONDS: '29' },
		{ AZURE_DEVOPS_PAT: 'test', AZURE_DEVOPS_REPOSITORY_IDS: '' },
	])('OPS-003 isolates invalid ADO settings %j', (env) => {
		expect(configuration({ ...env, COPILOT_GITHUB_TOKEN: 'synthetic' }).adoStatus.state).toBe(
			'configuration_error',
		);
		expect(
			configuration({ ...env, COPILOT_GITHUB_TOKEN: 'synthetic' }).copilotStatus.state,
		).toBe('ready');
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
