import { z } from 'zod';

/** Validates object identity, not current access or membership in the configured ADO scope. */
export const referenceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('workItem'),
		organization: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
		project: z.string().min(1),
		id: z.number().int().positive(),
	}),
	z.object({
		kind: z.literal('pullRequest'),
		organization: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
		project: z.string().min(1),
		repositoryId: z.uuid(),
		id: z.number().int().positive(),
	}),
]);

/** Stable ADO identity retained even when credentials, configuration, or access change. */
export type Reference = z.infer<typeof referenceSchema>;

/** Builds the HTTPS ADO link for a validated identity without checking current access. */
export function referenceUrl(reference: Reference): string {
	const organization = encodeURIComponent(reference.organization);
	const project = encodeURIComponent(reference.project);
	const base = `https://dev.azure.com/${organization}/${project}`;

	if (reference.kind === 'workItem') {
		return `${base}/_workitems/edit/${reference.id}`;
	}

	return `${base}/_git/${reference.repositoryId}/pullrequest/${reference.id}`;
}
