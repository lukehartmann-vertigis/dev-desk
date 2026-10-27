# ADR-0006: Frontend and Code Conventions

Date: 2026-10-26  
Status: Accepted

## Context

The project needs consistent implementation and quality conventions before coding.
The user selected npm, real tabs at width 4, single quotes, semicolons, and a
Tailwind/Framer Motion frontend.

## Decision

Use Tailwind CSS and Framer Motion with React/Next.js. Use npm, ESLint, Prettier,
Vitest, and Playwright. Format TypeScript with actual tabs, tab width 4, single
quotes, and semicolons. Use Zod for runtime validation and structured server logs.

Keep repository language English and TypeScript strict.

## Alternatives considered

- pnpm: replaced by the user's npm preference.
- Four literal spaces: explicitly clarified to real tabs with display width 4.
- CSS Modules as the primary styling solution: replaced by Tailwind.
- Biome: ESLint and Prettier were selected instead.
- Animation-free UI: Framer Motion was requested; reduced-motion accessibility
  remains required.

## Consequences

- Commit an npm lockfile when implementation begins; do not mix package managers.
- Avoid overlapping formatter/linter responsibilities.
- Use minimal client-component boundaries for motion.
- Language-specific formatter constraints override literal tabs where needed.
- Additional conventions and exact tool versions remain draft details until
  baseline review and compatibility checks.

## Verification

[Code style](../code-style.md),
[UX-004](../requirements/experience-and-operations.md#ux-004--motion), and
[OPS-009](../requirements/experience-and-operations.md#ops-009--release-verification).

## Follow-up review — 2026-10-26

The user approved baseline v1/P0, including the engineering conventions and
release quality contracts. The additional conventions previously described as
draft are now part of that baseline. Concrete package versions and compatible
tool configuration still require G0 evidence; no tooling has been implemented.

## G0 follow-up — 2026-10-26

The separately authorized [G0 fixture](../verification/g0.md) now verifies a
locked toolchain and its formatting/lint/typecheck/build/browser integration.
It uses direct compatible ESLint presets rather than the aggregate Next preset,
and the official modern `motion` package for the accepted Framer Motion choice.
These are tooling refinements, not changes to approved product behavior.
No application scaffold or feature implementation is implied.

## Delivery follow-up — 2026-10-26

The user explicitly authorized feature implementation in
[ADR-0011](0011-integrated-delivery-and-verification.md). The root application now
implements these conventions and quality commands. Current source, browser, and
native-runtime results are in the
[application report](../verification/application.md); the paragraphs above
describe the earlier planning/G0 state.
