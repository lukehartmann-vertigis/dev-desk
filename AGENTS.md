# Agents Instructions

## General

- Repository language is **english**. This means comments, naming (variables, functions, classes, modules ...), documentation etc. is all in **english**
- Interact with the user in the language they interact with you

## Feature delivery workflow

- Follow the [development workflow](docs/development-workflow.md) for new features and relevant behavior or architecture changes. Load the [feature-workflow skill](.github/skills/feature-workflow/SKILL.md) before proceeding.
- Agree on the concept before editing feature requirements or ADRs. After documenting it, obtain separate, explicit implementation approval before changing application code, dependencies, configuration, migrations, or tests.
- Planning requests are not implementation approval. Neither accepted ADRs nor earlier features' approvals authorize a new increment. Reconfirm material scope changes.
- Small fixes, behavior-preserving refactors, and editorial changes use the workflow's short check; do not manufacture requirements or ADRs for them.
- Keep approval, implementation, and verification status separate. Preserve accepted ADR history and report unverified acceptance criteria honestly.
- The optional [Feature Planner](.github/agents/feature-planner.agent.md) handles planning and documentation only; the same approval rules apply when using the normal agent.

## Code documentation
- Document public API contracts that are not clear from names and types, including relevant constraints, return values, side effects, and error behavior.
- Follow the language's documentation conventions (for example, JSDoc for JavaScript/TypeScript) and nearby repository patterns.
- Comment internal code only to explain non-obvious intent, business rules, or important decisions, not merely because a function or class exists.
- Keep documentation concise and accurate when changing the associated code; avoid restating self-explanatory code or types.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
