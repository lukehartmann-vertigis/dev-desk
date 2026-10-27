import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as schema from './schema';

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
export type Store = ReturnType<typeof openStore>;
export function meta(store: Store, key: string) {
	return store.db.select().from(schema.metadata).where(eq(schema.metadata.key, key)).get()?.value;
}
export function setMeta(store: Store, key: string, value: string) {
	store.db
		.insert(schema.metadata)
		.values({ key, value })
		.onConflictDoUpdate({ target: schema.metadata.key, set: { value } })
		.run();
}
