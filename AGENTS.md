# Agents Instructions

## General

- Repository language is **english**. This means comments, naming (variables, functions, classes, modules ...), documentation etc. is all in **english**
- Interact with the user in the language they interact with you

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
