# ADR-0005: Persistent Todos and Deletion-Only AI Confirmation

Date: 2026-10-26  
Status: Accepted

## Context

The initial overview described daily lists and rollover. The user clarified that
the list should have no day relationship. The user also selected direct AI
creation/editing/completion, with confirmation only for deletion.

## Decision

Todos are persistent records, not daily instances. There is no rollover,
day assignment, or automatic copying.

AI may create, edit, and complete local todos in response to explicit user
instructions without a separate confirmation. Deletion requires confirmation.
Todo-to-work-item/PR linking is part of the MVP. Azure DevOps remains read-only.

## Alternatives considered

- Daily snapshots: add a workflow the user does not need.
- Confirmation for every AI write: rejected as unnecessary interaction overhead.
- Unrestricted AI deletion: rejected because deletion needs explicit confirmation.
- Read-only assistant: does not satisfy the selected MVP.

## Consequences

- Completion timestamps do not introduce day-based business logic.
- UI and AI must share validation, concurrency handling, and persistence rules.
- A model cannot approve its own deletion request.
- Direct non-delete writes retain some model-error risk; per-turn write intent
  and strict tools are required safeguards.
- Reopening, ordering through AI, completed-section presentation, and the exact
  approval lifetime are proposed refinements in the draft requirements.

## Verification

[Todo requirements](../requirements/todos.md),
[AI-005](../requirements/assistant.md#ai-005--direct-todo-creation),
[AI-006](../requirements/assistant.md#ai-006--direct-todo-updates), and
[AI-007](../requirements/assistant.md#ai-007--confirmed-deletion).

## Follow-up review — 2026-10-26

The refinements originally described as proposed above have since been confirmed:
reopening, completed-section presentation, AI ordering, and 5-minute exact
deletion approvals. Manual deletion also requires confirmation. See the
[reviewed baseline](../requirements/REQUIREMENTS.md#reviewed-product-refinements).
[ADR-0007](0007-automatic-ai-intent.md) records the selected automatic intent
policy and its accepted residual risk; it refines, rather than removes, the
independent deletion-confirmation requirement.
