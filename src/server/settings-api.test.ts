import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET, POST } from '../app/api/[...path]/route';
import { Azure } from './azure';
import { configuration } from './config';
import { openStore, type Store } from './store';

const boundary = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock('./runtime', () => ({ runtime: boundary.runtime }));

let store: Store;
let directory: string;
let azure: Azure;
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'devdesk-settings-api-'));
	store = openStore(join(directory, 'test.db'));
	const config = configuration({ AZURE_DEVOPS_PAT: 'synthetic-do-not-emit' });
	azure = new Azure(store, config, async () => new Response('', { status: 403 }));
	boundary.runtime.mockReturnValue({
		config,
		azure,
		stopping: false,
		sourceSettings: () => ({
			settings: azure.selection,
			connection: config.adoStatus,
			warnings: config.adoWarnings,
		}),
	});
});
afterEach(async () => {
	await azure.stop();
	store.sqlite.close();
	rmSync(directory, { recursive: true });
});

function request(path: string, value?: unknown, marked = true) {
	return new Request(`http://localhost:3000/api/${path}`, {
		method: value === undefined ? 'GET' : 'POST',
		headers: {
			host: 'localhost:3000',
			origin: 'http://localhost:3000',
			'content-type': 'application/json',
			'x-devdesk-request': marked ? '1' : '0',
		},
		...(value === undefined ? {} : { body: JSON.stringify(value) }),
	});
}
const context = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });

describe('settings API boundary', () => {
	it('SET-004/010 reads empty local selection without credentials or upstream discovery', async () => {
		const response = await GET(request('settings'), context('settings'));
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const data = await response.json();
		expect(data.settings).toEqual({
			organization: 'vertigis',
			revision: 0,
			boards: [],
			repositories: [],
		});
		expect(JSON.stringify(data)).not.toContain('synthetic-do-not-emit');
	});
	it('SET-003 saves exact revisions and rejects stale or unmarked writes', async () => {
		const command = { revision: 0, boards: [], repositories: [] };
		const saved = await POST(request('settings', command), context('settings'));
		expect(saved.status).toBe(200);
		expect((await saved.json()).settings.revision).toBe(1);
		expect((await POST(request('settings', command), context('settings'))).status).toBe(409);
		expect((await POST(request('settings', command, false), context('settings'))).status).toBe(
			415,
		);
		expect(azure.selection.revision).toBe(1);
	});
	it('OPS-005/SET-009 keeps settings readable with an explicitly blank invalid organization', async () => {
		const config = configuration({ AZURE_DEVOPS_ORG: '' });
		await azure.stop();
		azure = new Azure(store, config);
		boundary.runtime.mockReturnValue({
			config,
			azure,
			stopping: false,
			sourceSettings: () => ({
				settings: azure.selection,
				connection: config.adoStatus,
				warnings: [],
			}),
		});
		const response = await GET(request('settings'), context('settings'));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			settings: { organization: '(unconfigured)', boards: [], repositories: [] },
			connection: { state: 'configuration_error' },
		});
		expect(azure.read()).toEqual([]);
	});
	it('SET-009 exposes discovery failures explicitly without clearing selection or leaking tokens', async () => {
		const result = await POST(request('settings/catalog', {}), context('settings/catalog'));
		expect(result.status).toBe(200);
		const catalog = await result.json();
		expect(catalog.errors).toHaveLength(1);
		expect(catalog.errors[0]).toContain('denied');
		expect(JSON.stringify(catalog)).not.toContain('synthetic-do-not-emit');
		expect(azure.selection.revision).toBe(0);
	});
});
