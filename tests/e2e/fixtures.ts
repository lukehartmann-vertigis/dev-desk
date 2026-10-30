import type { Repository } from '../../src/lib/contracts';

/** UI-only sources; no test depends on production defaults or enables real Azure access. */
export const syntheticRepositories: [Repository, Repository] = [
	{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', project: 'Utilities', name: 'Synthetic repo A' },
	{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', project: 'Utilities', name: 'Synthetic repo B' },
];
