import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import hooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';

/** Shared correctness/readability rules; generated output and migration artifacts are excluded. */
export default defineConfig(
	{
		ignores: [
			'.next/**',
			'.data/**',
			'drizzle/**',
			'test-results/**',
			'playwright-report/**',
			'next-env.d.ts',
		],
	},
	js.configs.recommended,
	ts.configs.recommended,
	{
		languageOptions: {
			globals: {
				process: 'readonly',
				console: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				fetch: 'readonly',
				URL: 'readonly',
				AbortController: 'readonly',
				AbortSignal: 'readonly',
				Request: 'readonly',
				Response: 'readonly',
				TextEncoder: 'readonly',
				ReadableStream: 'readonly',
				crypto: 'readonly',
			},
		},
		plugins: { '@next/next': next, 'react-hooks': hooks },
		rules: {
			...next.configs['core-web-vitals'].rules,
			...hooks.configs.recommended.rules,
			curly: ['error', 'all'],
			'one-var': ['error', 'never'],
			'no-nested-ternary': 'error',
			'max-statements-per-line': ['error', { max: 1 }],
			'padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: '*', next: ['function', 'class'] },
			],
		},
	},
);
