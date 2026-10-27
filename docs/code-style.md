# Code Style and Engineering Conventions

Status: approved engineering conventions for baseline v1. Concrete tool
configurations are implemented in the root application, following the compatible
[G0 baseline](verification/g0.md). Current results are recorded in the
[application report](verification/application.md).

## 1. Language and naming

- Repository code, documentation, identifiers, comments, and errors are English.
- Use TypeScript with `strict`, `noUncheckedIndexedAccess`, and
  `exactOptionalPropertyTypes`. Enable checks deliberately, not by adding casts.
- Prefer `unknown` plus validation to `any`. Avoid double casts and non-null
  assertions used to conceal an unproven assumption.
- Components/types use PascalCase; functions/variables use camelCase; constants
  use descriptive names; environment variables use UPPER_SNAKE_CASE.
- Use kebab-case module filenames, following mandatory Next.js conventions for
  framework entry points. Hook names start with `use`.
- Prefer named exports; framework-required default exports are exceptions.

## 2. Formatting

Confirmed source-code conventions:

| Setting | Value |
| --- | --- |
| Package manager | npm; commit `package-lock.json` |
| Indentation | Actual tab characters, not four literal spaces |
| Tab display width | 4 |
| JavaScript/TypeScript strings | Single quotes |
| Statement termination | Semicolons |
| Formatter | Prettier |
| Linter | ESLint with compatible Next.js, React hooks, and TypeScript rules |

Additional formatter settings: `printWidth: 100`, `trailingComma: 'all'`,
and `endOfLine: 'lf'`. JSX attributes follow Prettier's double-quote default.
Use Prettier-compatible Tailwind class sorting if supported by the selected
versions. Disable ESLint formatting rules that conflict with Prettier.

Prettier's language-specific output takes precedence where literal tabs or single
quotes are not appropriate (for example YAML, Markdown, and JSON). Do not hand-edit
those formats to force invalid syntax.

## 3. Architecture rules

- Components own presentation; services own business rules; adapters own external
  integration details.
- Share domain operations between UI routes and AI tools. Do not implement two
  independent todo mutation paths.
- Keep server-only code out of browser import graphs.
- Prefer small functions and explicit value types over generic “manager” classes.
- Introduce an abstraction only when there are real consumers or a meaningful
  external boundary. No speculative multi-provider framework.
- Validate HTTP/tool/config inputs and normalize Azure DevOps responses at the
  boundary. Do not spread raw external response objects throughout the UI.
- Keep database transactions short; never perform network/model calls within them.

## 4. React, styling, and motion

- Use function components and minimal, explicit client-component boundaries.
- Server Components do not pass secrets or server objects as props.
- Use Tailwind utilities and a small shared token vocabulary for color, spacing,
  typography, and focus states. Avoid ad hoc repeated hard-coded values.
- Introduce reusable UI primitives for real repetition, not a complete design
  system in advance.
- Framer Motion is for short state transitions, not decorative looping animation.
- Respect reduced motion and test keyboard/focus behavior after animation.
- Use semantic HTML before ARIA. Never make pointer-only controls the sole path.

## 5. Errors and logging

- Define stable domain error codes and map them at transport boundaries.
- Catch errors only where recovery, annotation, or safe transport translation is
  possible. Unknown errors retain correlation and server diagnostics.
- No empty catches, fake empty-array fallbacks, or fabricated success results.
- Treat an empty successful query differently from a failed query.
- Log structured metadata, not secrets, prompts, complete upstream payloads, or
  raw request headers.
- Keep user-facing failures actionable without disclosing implementation details.

## 6. Documentation and comments

- Use concise JSDoc for public contracts whose constraints, side effects, or error
  behavior are not clear from names and types.
- Comment non-obvious business rules or trade-offs, not self-explanatory code.
- Update related requirements and ADRs when changing behavior or architecture.
- Accepted ADRs are historical records. A changed decision gets a superseding ADR,
  not a silent rewrite of the original rationale.

## 7. Testing conventions

- Use Vitest for pure domain tests, SQLite integration, adapter contract fixtures,
  scheduler behavior, and SDK policy/recovery tests.
- Place focused unit tests beside the module as `*.test.ts` or `*.test.tsx`.
- Keep cross-module persistence/adapter tests under `tests/integration` and browser
  flows under `tests/e2e`.
- Use Playwright for end-to-end behavior and keyboard/reduced-motion scenarios.
- Name cases by observable behavior; use Arrange–Act–Assert without unnecessary
  section comments.
- Use controlled clocks and fake timers for expiry, polling, and retries.
- Integration tests use isolated temporary databases and SDK state directories.
- Mock external services by default; opt-in live smoke tests never run merely
  because a developer has credentials in their environment.
- Associate release acceptance tests with requirement IDs in their titles or
  test metadata. Do not substitute a line-coverage number for behavior coverage.

## 8. Quality commands

These commands are implemented in the root [package](../package.json).
The historical G0 fixture has been removed; these commands run the actual
application:

| Command | Responsibility |
| --- | --- |
| `npm ci --ignore-scripts` | Reproduce the lockfile without lifecycle scripts |
| `npm run typecheck` | Strict TypeScript checks without emitting |
| `npm run lint` | ESLint, no ignored warnings |
| `npm run format:check` | Prettier check |
| `npm test` | Vitest domain and integration suites |
| `npm run test:e2e` | Playwright against an isolated production-like app |
| `npm run build` | Production Next.js build without secrets or external calls |

Run focused checks during development and all applicable checks for release.
Do not enable network-backed AI/Azure DevOps tests in the default test command.

### G0 toolchain refinement

The fixture uses ESLint 10 with direct compatible Next, React Hooks, and
typescript-eslint presets because the aggregate Next preset's transitive plugins
did not support that ESLint version. Strict checking covers owned source and its
API usage; `skipLibCheck` excludes incompatible optional-dialect declarations
inside dependencies. The [G0 report](verification/g0.md) records exact versions,
narrow dependency overrides, and the limits of these checks.
