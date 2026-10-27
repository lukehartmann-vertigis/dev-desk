# ADR-0007: Automatic AI Intent Classification Without a Mode Switch

Date: 2026-10-26  
Status: Accepted

## Context

Direct AI todo writes are already accepted, except deletion which requires
confirmation. The remaining choice was how to authorize a turn for mutations:
explicit read/write mode, automatic intent classification, or always-available
write tools.

The user selected automatic classification and accepted the risk of incorrect
intent assignment in exchange for a natural-language-only interaction.

## Decision

Do not require a write-mode toggle for each message. Automatically classify
user intent; ask for clarification when uncertain. Enable only the bounded local
todo operations appropriate to the resulting application policy decision.

Allow direct creation, title/reference editing, completion, reopening, and
reordering. Deletion still needs separate, exact, one-use UI approval.

The conversation is one persistent, clearable chat. One run is active at a time,
with a total 120-second budget and at most 10 tool invocations. Disconnect, tab
closure, or explicit cancel stops further dispatch; committed changes remain.

## Alternatives considered

- Explicit per-message read/write switch: stronger deterministic separation, but
  rejected in favor of automatic intent.
- Always expose mutation tools: broader than the selected intent-based approach.
- Confirm every mutation: conflicts with the confirmed direct-write experience.

## Consequences

- Automatic classification may wrongly authorize a non-delete todo update. This
  residual risk is explicitly accepted, not hidden behind a safety guarantee.
- A classifier is not permission to execute arbitrary tools. Server validation,
  scope, revision checks, and retry safety remain required.
- Azure DevOps writes, shell/filesystem tools, secret exposure, and model-approved
  deletion stay prohibited regardless of inferred intent.
- Classifier implementation and test corpus are proposed technical details.
  Failed/invalid classification cannot silently default to write permission.
- Switching to a UI mode or confirmation for all writes would require another
  product decision, not an undocumented implementation fallback.

## Verification

[AI-006](../requirements/assistant.md#ai-006--direct-todo-updates),
[AI-007](../requirements/assistant.md#ai-007--confirmed-deletion),
[AI-009](../requirements/assistant.md#ai-009--untrusted-content), and
[AI-011](../requirements/assistant.md#ai-011--bounded-runs).

Test recorded read/clarify decisions for absent mutation tools and all decisions
for independent hard prohibitions. Classification accuracy on a test set is not
proof that every natural-language request will be classified correctly.
