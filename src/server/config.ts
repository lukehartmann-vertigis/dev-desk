import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { IntegrationStatus } from '../lib/contracts';

const nonempty = z.string().trim().min(1);

function status(present: boolean, valid: boolean, name: string): IntegrationStatus {
	if (!present) {
		return {
			state: 'disabled',
			message: `${name} is not configured. Set its token in .env and restart.`,
		};
	}
	if (valid) {
		return { state: 'ready', message: `${name} configured. Connection is checked when used.` };
	}
	return {
		state: 'configuration_error',
		message: `${name} configuration is invalid or incomplete. Check .env and restart.`,
	};
}

/**
 * Validates local settings without I/O. Invalid core settings throw; integration failures
 * become independent disabled/error states so local todos remain usable.
 * The returned configuration contains secrets and must stay server-side.
 */
export function configuration(env: Readonly<Record<string, string | undefined>> = process.env) {
	const organization = env.AZURE_DEVOPS_ORG ?? 'vertigis';
	const core = z.object({ database: nonempty, origin: z.url() }).parse({
		database: env.DATABASE_PATH ?? '.data/dashboard.db',
		origin: env.APP_ORIGIN ?? 'http://localhost:3000',
	});
	const adoPresent = [
		'AZURE_DEVOPS_PAT',
		'AZURE_DEVOPS_ORG',
		'SYNC_INTERVAL_SECONDS',
		'AZURE_DEVOPS_USER_EMAIL',
	].some((key) =>
		key === 'AZURE_DEVOPS_PAT' ? Boolean(env[key]?.trim()) : env[key] !== undefined,
	);
	const ado = z
		.object({
			token: nonempty,
			org: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
			interval: z.coerce.number().int().min(30).max(3600),
			email: z.email().optional(),
		})
		.safeParse({
			token: env.AZURE_DEVOPS_PAT,
			org: organization,
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
		adoWarnings: ['AZURE_DEVOPS_PROJECTS', 'AZURE_DEVOPS_REPOSITORY_IDS']
			.filter((key) => env[key] !== undefined)
			.map((key) => `${key} is deprecated and ignored. Select sources in Settings.`),
		// An invalid empty connection must not block local reads or reuse a real organization's settings.
		adoOrganization: organization.trim() || '(unconfigured)',
		copilot: copilot.success
			? { ...copilot.data, statePath: resolve(copilot.data.statePath) }
			: null,
		copilotStatus: status(copilotPresent, copilot.success, 'Copilot'),
	};
}
/** Validated server-only settings; ready integration status does not establish upstream access. */
export type Configuration = ReturnType<typeof configuration>;
