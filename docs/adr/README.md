# Architecture Decision Records

## Register

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-local-nextjs-monolith.md) | Local Next.js modular monolith | Accepted |
| [0002](0002-sqlite-persistence.md) | SQLite, Drizzle, and persistent local storage | Accepted |
| [0003](0003-copilot-assistant.md) | Copilot SDK and persistent chat | Accepted |
| [0004](0004-background-sync.md) | In-process polling with scoped persistent snapshots | Accepted after lifecycle verification |
| [0005](0005-todo-lifecycle-and-ai-writes.md) | Persistent todos and deletion-only AI confirmation | Accepted |
| [0006](0006-frontend-and-code-conventions.md) | Tailwind/Motion and TypeScript/npm conventions | Accepted |
| [0007](0007-automatic-ai-intent.md) | Automatic AI intent classification without a mode switch | Accepted |
| [0008](0008-clickdummy-visual-baseline.md) | Clickdummy as visual baseline, not business-logic authority | Accepted |
| [0009](0009-ado-scope-and-review-visibility.md) | Explicit repository scope and personal/group review visibility | Accepted |
| [0010](0010-local-first-failure-isolation.md) | Isolate integration configuration failures from local operation | Accepted |
| [0011](0011-integrated-delivery-and-verification.md) | Lift the up-front G0 blocker and deliver with integrated verification | Accepted by explicit user instruction |
| [0012](0012-informational-legends-and-team-scopes.md) | Informational legends and team-board area-scope annotations without display filters | Accepted; local-display prohibition superseded by [0014](0014-local-scope-chips-and-tool-outcomes.md) |
| [0013](0013-safe-markdown-and-todo-drag-handles.md) | Safe assistant Markdown and accessible persistent todo drag handles | Accepted for the requested frontend enhancement |
| [0014](0014-local-scope-chips-and-tool-outcomes.md) | Single-select in-tab scope chips and compact literal tool disclosures | Accepted by explicit user instruction |
| [0015](0015-persisted-azure-devops-settings.md) | Persisted application-wide Azure DevOps source selection with organization-wide discovery and an empty initial scope | Accepted; implemented, live account discovery not certified |

## Status policy

- **Proposed**: requires the review or verification specified by the record; not
  permission to implement.
- **Accepted**: the decision was confirmed during planning, or its recorded
  conditional-acceptance evidence has subsequently been met. This does not mean
  every associated requirement or runtime scenario has been tested.
- **Superseded**: retained for history, with a link to its replacement.

The user approved baseline v1/P0 on 2026-10-26, including active requirement
contracts and engineering conventions. Accepted decisions do not constitute
passing tests. ADR-0004's lifecycle condition was subsequently met by the
[G0 fixture](../verification/g0.md); G0 overall remains partial because live
integration and AI policy evidence is still outstanding.
The user's subsequent [ADR-0011](0011-integrated-delivery-and-verification.md)
explicitly authorizes feature implementation without claiming G0 has passed.
The later settings discussion explicitly requests documentation before
implementation. [ADR-0015](0015-persisted-azure-devops-settings.md) records that
increment without treating ADR-0011 as authorization to implement it now.

New decisions use the next number and contain date, status, context, decision,
alternatives, consequences, and verification links. Do not silently revise
accepted historical decisions to conceal a changed direction.
