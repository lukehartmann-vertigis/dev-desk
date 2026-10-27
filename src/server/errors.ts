import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

// Next.js server entry bundles must recognize the same trusted error contract.
const applicationError = Symbol.for('devdesk.application-error');

/** Trusted, client-safe failure that retains its identity across Next.js server entry bundles. */
export class AppError extends Error {
	/** Cross-bundle trust marker; callers should use {@link AppError.is} rather than inspect it. */
	readonly [applicationError] = true;

	/**
	 * @param code Stable machine-readable error code.
	 * @param message Client-safe explanation; never include secrets or raw provider errors.
	 * @param status HTTP status used by transport adapters.
	 */
	constructor(
		public code: string,
		message: string,
		public status = 400,
	) {
		super(message);
		this.name = 'AppError';
	}

	/** Recognizes application-owned errors, including errors from another compiled entry bundle. */
	static is(error: unknown): error is AppError {
		return (
			error instanceof Error && applicationError in error && error[applicationError] === true
		);
	}
}
/** Emits structured metadata with UTC time and a correlation ID; fields must exclude private content. */
export function log(
	event: string,
	severity: 'info' | 'error',
	fields: Record<string, unknown> = {},
) {
	console[severity === 'error' ? 'error' : 'info'](
		JSON.stringify({
			event,
			severity,
			timestamp: new Date().toISOString(),
			correlationId: randomUUID(),
			...fields,
		}),
	);
}
/** Preserves trusted/validation errors and logs only an unknown error's type before redacting it. */
export function safeError(error: unknown): AppError {
	if (AppError.is(error)) {
		return error;
	}
	if (error instanceof ZodError) {
		return new AppError(
			'VALIDATION',
			error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
		);
	}
	log('operation.failed', 'error', {
		errorType: error instanceof Error ? error.name : 'unknown',
	});
	return new AppError(
		'INTERNAL',
		'The operation failed. Check the application logs and storage permissions.',
		500,
	);
}
