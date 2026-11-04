# ADR-0018: Independent Handoff Versions and Direct Message Ownership

Date: 2026-11-03
Status: Accepted for the explicitly approved relational ownership and independent,
versioned handoff model. Documentation authorized; separate implementation
approval pending. Not implemented or functionally verified.

Subsequent plan approval (2026-11-03): the user explicitly approved the documented
combined scope, architecture, work order, and planned checks. ADR-0016 is now
Accepted; references below to its proposed status record the earlier approval
boundary. This update does not grant separate implementation approval or claim
runtime verification, and the original accepted decision is preserved.

## Context

The user approved independently retrievable handoffs, then clarified the need for
precise message provenance and the purpose of runs. The resulting model separates
conversation content, technical execution attempts, and durable work products.
The user explicitly authorized documentation, including retaining handoffs after
deletion of their source chat.

The accepted [ADR-0017](0017-structured-planning-handoff-tool.md) previously placed
handoffs inside the owning chat's lifecycle. That would make independent retrieval
and retention depend on the chat or require divergent copies. The proposed
[ADR-0016](0016-durable-chat-history.md) also needs direct conversation ownership
of messages instead of treating runs as their sole persistence owner.

Requirements: [AI-024 through AI-027](../requirements/assistant.md#independent-handoff-artifacts-increment),
alongside the [handoff tool](../requirements/assistant.md#ai-023---validated-handoff-creation-tool)
and [chat-history requirements](../requirements/assistant.md#durable-chat-history-increment).

## Decision

Use the existing SQLite database with the following logical entities. Field names
describe relationships, not a prescribed SQL migration or finalized API encoding.

| Entity | Responsibility and relationships |
| --- | --- |
| `conversations` | Durable title, timestamps, lifecycle, and SDK session association |
| `messages` | Direct `conversationId`; optional `runId`; stable role/content/status and ordering |
| `runs` | `conversationId`, triggering `requestMessageId`, execution status and timestamps |
| `handoffs` | Stable independent identity for a planning work product |
| `handoff_versions` | `handoffId`, version identity/order, complete immutable content and source metadata, nullable origin-message/run links |

- Persist a user message independently of provider execution. Multiple execution
  attempts may reference the same message; retaining a message does not require
  a successful run. Keep runs for bounded execution, interruption, tool grouping,
  and approval ownership, not as the only owners of transcript content.
- Enforce same-conversation invariants for message/run/request/approval links
  using persistence and domain validation. The model cannot select arbitrary
  provenance or ownership identifiers. The source conversation is derivable
  through the message/run records while those records exist.
- Keep one existing agent and `create_planning_handoff`. Its transaction creates
  a handoff/version as applicable, the durable operation receipt, and a typed
  tool-result message referencing the exact version. All commit together or
  none do. Return the committed result on replay; conflicting identity reuse
  fails. Success does not depend on a later final assistant response.
- Record the triggering user message and producing run as provenance for each
  version. The output tool message points to that version; it is not itself the
  only copy of the handoff. Preserve a complete snapshot of title, ticket/source
  identity, retrieval times, constraints, content, and limitations, with enough
  schema/export information to reproduce that version's meaning.
- Treat explicit revisions as new immutable versions, not overwritten content.
  Old chat references remain pinned to their original versions. The same ticket
  may have multiple distinct handoffs; do not silently merge them by ticket ID.
- Provide a dedicated overview/detail, findable by ticket/title, with version
  selection and exact-version copying. Resolve chat and overview presentations
  from the same authoritative version, not independently editable copies.
- Read saved artifacts without Copilot, upstream retrieval, or the source chat.
  Label them historical snapshots; they do not prove current source authorization
  or freshness. New retrievals and revisions still use committed settings scope.
- Chat deletion removes its messages/runs/SDK state but detaches nullable artifact
  provenance references using `SET NULL` or equivalent transactional behavior.
  Never cascade chat, message, or run deletion into independent handoff content.
  No hidden retention of the entire deleted chat is needed to keep the artifact.
- Remove a handoff and all its saved versions only after its own target-bound UI
  confirmation. A changed version set requires renewed confirmation. Preserve the
  conversation and display remaining chat references as unavailable rather than
  retaining a shadow artifact payload. Removal does not erase prior discussion,
  copied exports, backups, or provider records.

This partially supersedes ADR-0017's chat-owned storage and lifecycle, including
its renderer source and chat-deletion consequence. Its single-agent/tool choice,
schema validation, server-bound provenance, replay safeguards, run limits, and
prohibitions on host/repository/external writes remain unchanged. ADR-0016 remains
proposed for its detailed SDK lifecycle; this decision approves only the ownership
refinement described here, not every detail of that proposal.

## Alternatives considered

- Chat-owned handoff entries only: initially smaller, but independent retention
  and overview access remain coupled to the chat's existence.
- Copy handoffs into an archive while retaining chat payloads: creates two
  authoritative versions that can diverge; use references instead.
- Attach provenance only to the conversation: locates broad context but not the
  exact triggering request or producing attempt.
- Keep messages owned only by runs: couples user content to execution startup
  and complicates retries that should reference the same saved user message.
- Remove runs: possible in a different design, but discards an existing useful
  boundary for execution status, cancellation, tool results, and approvals.
- A second database, external artifact service, event-sourcing platform, or
  second agent: unnecessary for this local single-user workflow.

## Consequences

- Requires versioned migrations for direct message ownership, handoffs/versions,
  message references, nullable provenance, and durable replay handling in the
  existing database. Preserve existing runs/messages and verified SDK mappings;
  do not infer structured artifacts from ordinary historical prose.
- Artifact creation and its chat reference need atomicity; deletion needs explicit
  lifecycle isolation in both directions. Backup/restore includes independent
  handoff data as well as chat and required SDK state.
- History grows without automatic expiry. Immutable content provides version
  traceability, not tamper-proof audit certification or complete recovery without
  backups after disk/volume loss.
- Adds a focused handoff overview and its own confirmed removal, not a repository
  execution engine, implementation-approval state machine, per-version/bulk
  deletion, cross-chat search, or automatic VS Code submission.

## Approval and verification

The user explicitly approved documenting this combined model on 2026-11-03,
including retaining independent handoffs after chat deletion. This approval is
not implementation authorization. No code, migrations, tests, or runtime
configuration are changed by this record.

Follow the [combined implementation and verification plan](../requirements/assistant.md#independent-handoff-artifacts-increment).
Record actual evidence in the [application report](../verification/application.md)
against AI-014 through AI-027. Planned checks cover migration preservation, direct
message ownership without a run, multiple attempts for one request, provenance
integrity, atomic rollback, operation replay, immutable revisions, exact-version
render/export, independent discovery, chat deletion with artifact retention,
target-bound artifact deletion, unavailable references, restart/container
retention, and backup/restore using disposable synthetic data.

All functional checks remain unperformed. Live SDK continuation, real source
permissions/fields, and browser clipboard acceptance remain separate from fixture
results. The next permitted application change requires explicit implementation
approval and an implementation-capable agent.

Implementation (2026-11-03): delivered after explicit implementation approval.
`runs.requestMessageId` is nullable only for migrated legacy runs whose request
message cannot be identified; new runs always set it. Evidence and open live
checks: [application report](../verification/application.md#durable-chats-and-planning-handoffs--2026-11-03).