import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as schema from './schema';

/**
 * Opens local SQLite, enables durability/foreign-key settings, and applies committed migrations.
 * Creates parent directories; filesystem, database, and migration failures propagate to startup.
 * The owner must close the returned SQLite handle after its services stop.
 */
export function openStore(path: string) {
	mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path);
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('synchronous = FULL');
	sqlite.pragma('busy_timeout = 5000');
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
	db.insert(schema.metadata)
		.values({ key: 'listRevision', value: '0' })
		.onConflictDoNothing()
		.run();
	return { db, sqlite };
}
/** Shared process-owned Drizzle/SQLite handles; do not close them from individual requests. */
export type Store = ReturnType<typeof openStore>;

/** Reads local metadata without network access; returns undefined only when the key is absent. */
export function meta(store: Store, key: string) {
	return store.db.select().from(schema.metadata).where(eq(schema.metadata.key, key)).get()?.value;
}
/** Inserts or replaces metadata, joining the caller's transaction when one is active. */
export function setMeta(store: Store, key: string, value: string) {
	store.db
		.insert(schema.metadata)
		.values({ key, value })
		.onConflictDoUpdate({ target: schema.metadata.key, set: { value } })
		.run();
}
