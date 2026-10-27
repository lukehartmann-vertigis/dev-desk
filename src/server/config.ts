import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { IntegrationStatus } from '../lib/contracts';

export const initialRepositories = [
	{ id: '446326e4-f451-4018-99ec-e80e667cbec2', project: 'Utilities', name: 'network-locator' },
	{ id: '87401d25-3efa-41f0-b5ea-a3438dc77e6c', project: 'Utilities', name: 'Utilities' },
];
const nonempty = z.string().trim().min(1);
const list = (value: string) => value.split(',').map((item) => item.trim());
function status(present: boolean, valid: boolean, name: string): IntegrationStatus {
	return !present
		? {
				state: 'disabled',
				message: `${name} is not configured. Set its token in .env and restart.`,
			}
		: valid
			? { state: 'ready', message: `${name} configured. Connection is checked when used.` }
			: {
					state: 'configuration_error',
					message: `${name} configuration is invalid or incomplete. Check .env and restart.`,
				};
}
export function configuration(env: Readonly<Record<string, string | undefined>> = process.env) {
	const core = z.object({ database: nonempty, origin: z.url() }).parse({
		database: env.DATABASE_PATH ?? '.data/dashboard.db',
		origin: env.APP_ORIGIN ?? 'http://localhost:3000',
	});
	const adoPresent = [
		'AZURE_DEVOPS_PAT',
		'AZURE_DEVOPS_ORG',
		'AZURE_DEVOPS_PROJECTS',
		'AZURE_DEVOPS_REPOSITORY_IDS',
		'SYNC_INTERVAL_SECONDS',
		'AZURE_DEVOPS_USER_EMAIL',
	].some((key) =>
		key === 'AZURE_DEVOPS_PAT' ? Boolean(env[key]?.trim()) : env[key] !== undefined,
	);
	const ado = z
		.object({
			token: nonempty,
			org: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
			projects: z.array(nonempty).min(1),
			repositoryIds: z.array(z.uuid()).min(1),
			interval: z.coerce.number().int().min(30).max(3600),
			email: z.email().optional(),
		})
		.safeParse({
			token: env.AZURE_DEVOPS_PAT,
			org: env.AZURE_DEVOPS_ORG ?? 'vertigis',
			projects: list(env.AZURE_DEVOPS_PROJECTS ?? 'Utilities'),
			repositoryIds: list(
				env.AZURE_DEVOPS_REPOSITORY_IDS ??
					initialRepositories.map((repo) => repo.id).join(','),
			),
			interval: env.SYNC_INTERVAL_SECONDS ?? 180,
			...(env.AZURE_DEVOPS_USER_EMAIL ? { email: env.AZURE_DEVOPS_USER_EMAIL } : {}),
		});
	const copilotPresent = ['COPILOT_GITHUB_TOKEN', 'COPILOT_MODEL', 'COPILOT_STATE_PATH'].some(
		(key) =>
			key === 'COPILOT_GITHUB_TOKEN' ? Boolean(env[key]?.trim()) : env[key] !== undefined,
	);
	const copilot = z.object({ token: nonempty, model: nonempty, statePath: nonempty }).safeParse({
		token: env.COPILOT_GITHUB_TOKEN,
		model: env.COPILOT_MODEL ?? 'gpt-4.1',
		statePath: env.COPILOT_STATE_PATH ?? join(dirname(resolve(core.database)), 'copilot'),
	});
	return {
		database: resolve(core.database),
		origin: new URL(core.origin).origin,
		ado: ado.success ? ado.data : null,
		adoStatus: status(adoPresent, ado.success, 'Azure DevOps'),
		copilot: copilot.success
			? { ...copilot.data, statePath: resolve(copilot.data.statePath) }
			: null,
		copilotStatus: status(copilotPresent, copilot.success, 'Copilot'),
	};
}
export type Configuration = ReturnType<typeof configuration>;
