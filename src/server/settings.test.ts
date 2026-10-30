import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveSettingsSchema } from '../lib/contracts';
import { readSettings, writeSettings } from './settings';
import { openStore, setMeta, type Store } from './store';

let directory: string;
let store: Store;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-settings-'));
	store = openStore(join(directory, 'test.db'));
});
afterEach(() => {
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});
const source = {
	id: '11111111-1111-4111-8111-111111111111',
	projectId: '22222222-2222-4222-8222-222222222222',
	project: 'Synthetic project',
	name: 'Team A',
};

describe('persisted source settings', () => {
	it('SET-010 starts empty even with legacy cache and metadata', () => {
		setMeta(store, 'vertigis:boards:Utilities', '{"boards":[]}');
		store.sqlite
			.prepare(
				"INSERT INTO snapshots(scope,dataset,data) VALUES ('vertigis:work:Utilities','work','[]')",
			)
			.run();
		expect(readSettings(store, 'VERTIGIS')).toEqual({
			organization: 'vertigis',
			revision: 0,
			boards: [],
			repositories: [],
		});
	});
	it('SET-003/004 saves both lists and empty selections durably', () => {
		const initial = readSettings(store, 'example');
		const saved = writeSettings(store, {
			...initial,
			boards: [source],
			repositories: [
				{ ...source, id: '33333333-3333-4333-8333-333333333333', name: 'Repository' },
			],
		});
		store.sqlite.close();
		store = openStore(join(directory, 'test.db'));
		expect(readSettings(store, 'example')).toEqual(saved);
		expect(readSettings(store, 'other').boards).toEqual([]);
		const empty = writeSettings(store, { ...saved, boards: [], repositories: [] });
		expect(empty.revision).toBe(2);
		expect(readSettings(store, 'example')).toEqual(empty);
	});
	it('SET-003 rejects stale saves and rolls back both lists on storage failure', () => {
		const initial = readSettings(store, 'example');
		writeSettings(store, { ...initial, boards: [source] });
		expect(() => writeSettings(store, initial)).toThrow('another tab');
		store.sqlite.exec(
			"CREATE TEMP TRIGGER reject_settings BEFORE UPDATE ON azure_settings BEGIN SELECT RAISE(ABORT, 'test write failure'); END",
		);
		expect(() =>
			writeSettings(store, { ...readSettings(store, 'example'), boards: [] }),
		).toThrow('test write failure');
		expect(readSettings(store, 'example').boards).toEqual([source]);
		expect(readSettings(store, 'example').revision).toBe(1);
	});
	it('SET-003 validates identities and rejects duplicate selections', () => {
		expect(
			saveSettingsSchema.safeParse({
				revision: 0,
				boards: [source, source],
				repositories: [],
			}).success,
		).toBe(false);
		expect(
			saveSettingsSchema.safeParse({
				revision: 0,
				boards: [{ id: 'bad', projectId: source.projectId }],
				repositories: [],
			}).success,
		).toBe(false);
		expect(saveSettingsSchema.parse({ revision: 0, boards: [], repositories: [] })).toEqual({
			revision: 0,
			boards: [],
			repositories: [],
		});
	});
});
