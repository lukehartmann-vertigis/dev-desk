import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

// Next.js server entry bundles must recognize the same trusted error contract.
const applicationError = Symbol.for('devdesk.application-error');

export class AppError extends Error {
	readonly [applicationError] = true;

	constructor(
		public code: string,
		message: string,
		public status = 400,
	) {
		super(message);
		this.name = 'AppError';
	}

	static is(error: unknown): error is AppError {
		return (
			error instanceof Error && applicationError in error && error[applicationError] === true
		);
	}
}
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
export function safeError(error: unknown): AppError {
	if (AppError.is(error)) return error;
	if (error instanceof ZodError)
		return new AppError(
			'VALIDATION',
			error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
		);
	log('operation.failed', 'error', {
		errorType: error instanceof Error ? error.name : 'unknown',
	});
	return new AppError(
		'INTERNAL',
		'The operation failed. Check the application logs and storage permissions.',
		500,
	);
}
