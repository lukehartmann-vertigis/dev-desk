import { z } from 'zod';

const uuid = z.uuid().transform((value) => value.toLowerCase());
const sourceIdentitySchema = z.object({ id: uuid, projectId: uuid });

/** Stable source identity with server-resolved labels retained when access is lost. */
export const sourceSchema = sourceIdentitySchema.extend({
	project: z.string().min(1),
	name: z.string().min(1),
});
export type Source = z.infer<typeof sourceSchema>;

/** Committed organization-scoped selection; an absent record has revision zero and empty lists. */
export const settingsSchema = z.object({
	organization: z.string().min(1),
	revision: z.number().int().nonnegative(),
	boards: z.array(sourceSchema),
	repositories: z.array(sourceSchema),
});
export type SourceSettings = z.infer<typeof settingsSchema>;

const selectionSchema = z.array(sourceIdentitySchema).superRefine((sources, context) => {
	const ids = sources.map((source) => source.id);
	if (new Set(ids).size !== ids.length) {
		context.addIssue({ code: 'custom', message: 'Select each source only once.' });
	}
});

/** Save replaces both lists against an exact revision; client labels never establish ownership. */
export const saveSettingsSchema = z.object({
	revision: z.number().int().nonnegative(),
	boards: selectionSchema,
	repositories: selectionSchema,
});
export type SaveSettings = z.infer<typeof saveSettingsSchema>;

/** Metadata-only discovery; errors distinguish incomplete/failed discovery from a complete empty list. */
export const sourceCatalogSchema = z.object({
	boards: z.array(sourceSchema),
	repositories: z.array(sourceSchema),
	errors: z.array(z.string()),
});
export type SourceCatalog = z.infer<typeof sourceCatalogSchema>;

/** Safe settings response, including connection/deprecation feedback without credentials. */
export const settingsResponseSchema = z.object({
	settings: settingsSchema,
	connection: z.object({
		state: z.enum(['disabled', 'configuration_error', 'ready']),
		message: z.string(),
	}),
	warnings: z.array(z.string()),
});
