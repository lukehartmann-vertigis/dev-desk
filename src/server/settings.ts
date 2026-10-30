import { eq } from 'drizzle-orm';
import { settingsSchema, type SourceSettings } from '../lib/contracts/settings';
import { AppError } from './errors';
import { azureSettings } from './schema';
import type { Store } from './store';

/** Reads committed settings locally; never imports legacy environment scope or performs discovery. */
export function readSettings(store: Store, organization: string): SourceSettings {
	const key = organization.toLowerCase();
	const row = store.db
		.select()
		.from(azureSettings)
		.where(eq(azureSettings.organization, key))
		.get();
	return settingsSchema.parse(
		row ?? { organization: key, revision: 0, boards: [], repositories: [] },
	);
}

/** Atomically replaces validated sources; stale writes fail, including concurrent first saves. */
export function writeSettings(store: Store, settings: SourceSettings): SourceSettings {
	const next = settingsSchema.parse(settings);
	return store.db.transaction(() => {
		const current = readSettings(store, next.organization);
		if (current.revision !== next.revision) {
			throw new AppError(
				'CONFLICT',
				'Settings changed in another tab. Reload the saved selection before saving again.',
				409,
			);
		}
		const committed = {
			...next,
			organization: current.organization,
			revision: next.revision + 1,
		};
		store.db
			.insert(azureSettings)
			.values(committed)
			.onConflictDoUpdate({ target: azureSettings.organization, set: committed })
			.run();
		return committed;
	});
}
