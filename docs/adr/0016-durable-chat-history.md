# ADR-0016: Durable Conversation History and Scoped SDK Lifecycle

Date: 2026-11-03
Status: Accepted as part of the user's explicit approval of the documented
combined plan on 2026-11-03. Separate implementation approval is pending.
Not implemented or verified.

The later accepted [ADR-0018](0018-independent-handoff-artifacts.md) records the
approved relational ownership refinement and independent handoff lifecycle.
This record incorporates that refinement. The subsequent combined-plan approval
accepts the documented SDK lifecycle as a design; it does not establish runtime
compatibility, passing tests, or authorization to implement.

## Context

The user approved multiple durable conversations with a history list, reopening
and continuation, non-destructive new-chat creation, and confirmed removal.
Chats must display references to independently retained handoff versions. See
[AI-018 through AI-022](../requirements/assistant.md#durable-chat-history-increment)
and [AI-014 through AI-017](../requirements/assistant.md#planning-handoff-increment).

The current schema stores runs, messages, and approvals without a conversation
owner. Chat runtime metadata and SDK continuation currently serve one global
conversation. Adding a history list alone would not isolate model context,
cleanup, or late events, and browser-only state would not satisfy durability.

## Decision

- Keep SQLite as the authoritative history store. Add stable conversation
  records for titles, timestamps, and lifecycle state. Conversations directly own
  messages and runs; message run association is optional, and each run references
  its triggering user message. This approved refinement is specified in ADR-0018.
  Do not copy transcripts into a second archive or rely on provider retention.
- Scope SDK session identity and cleanup metadata to the owning conversation.
  Reuse the existing persistent SDK storage boundary with explicit ownership;
  do not share one model conversation between distinct history entries.
- Preserve one application-wide active run and its existing time/tool limits.
  Require completion or explicit cancellation and cleanup before changing the
  active conversation. Bind requests, stream events, and mutation approvals to
  stable conversation/run identities, not the currently displayed UI entry.
- Read history from local storage independently of SDK availability. Resume only
  the selected chat with current permissions and tools. Failure to resume must
  not erase history or silently manufacture a context-free continuation.
- Migrate the current single transcript into one stable history entry without
  changing message order or run status. Adopt its saved SDK mapping only when
  ownership is established; otherwise keep history readable and report the
  continuation limitation. Do not silently discard existing records.
- Treat confirmed removal as chat-scoped application and SDK cleanup. Retain
  retryable cleanup state, block resumption of removed context, and report
  pending/failed cleanup honestly. Other chats and shared todos/settings survive.
- Keep exact-version references in chat while independent handoffs and versions
  live in the same SQLite database under ADR-0018. Chat removal detaches their
  provenance rather than deleting them. Add no local repository access, editor
  control, autonomous execution, provider, or Azure DevOps write capability.

This extends [ADR-0003](0003-copilot-assistant.md) only for multi-conversation
ownership, continuation, and cleanup. Its SDK/provider, explicit authentication,
on-demand data transfer, and capability restrictions remain unchanged.
[ADR-0002](0002-sqlite-persistence.md) still governs local persistence. Accepted
historical decisions are not rewritten; this accepted extension is not yet
implemented.

## Alternatives considered

- One permanent transcript: simpler and currently supported, but does not meet
  the approved independent-chat and history-navigation concept.
- Browser-only saved chats or exported Markdown: simple display/export options,
  but not authoritative durable application history with isolated continuation.
- Provider/SDK session inventory as the sole history: couples basic reading to
  SDK availability and fails to own structured app/tool outcomes and migration.
- Concurrent agents or per-chat parallel execution: adds scheduling and mutation
  races without being needed for the approved history scope; retain the global
  single-run boundary.

## Consequences

- Requires a versioned migration, conversation-scoped persistence and API
  contracts, runtime/session lifecycle changes, and history controls in the
  existing responsive chat surface. This is separate from the small clipboard
  affordance and must not be described as already implemented persistence.
- SDK resume, cancellation, startup interruption, and deletion cleanup need
  ownership-aware tests. Reading stored messages is independent of successful
  model continuation; these outcomes must remain separately visible.
- Backup/restore must cover both conversation records and necessary SDK state.
  Retention has no automatic expiry, so history grows until explicit removal;
  disk/volume loss still requires backups for recovery.
- Titles and ordering need no model call. Search, folders/tags, automatic
  summaries, bulk removal, and cloud synchronization remain out of scope.

## Approval and verification

The concept was explicitly approved on 2026-11-03. The record initially remained
Proposed pending architecture review; the user's subsequent explicit approval of
the documented combined plan on the same date accepts this architecture and its
planned checks. No separate implementation approval has been given. No migration,
implementation, or acceptance checks have been executed for this increment.

Follow the [implementation and verification plan](../requirements/assistant.md#durable-chat-history-increment).
Record actual evidence in the [application report](../verification/application.md),
including preservation of the old chat, two-chat isolation, restart and container
recreation with persistent storage, offline reading, failure to resume, and
chat-scoped cleanup. Live SDK/account behavior is a separate acceptance check,
not proven by synthetic fixtures or concept approval.

Implementation (2026-11-03): delivered after the user's explicit implementation
request. Migration `0002` rebuilds runs/messages/approvals inside the migrator
transaction with deferred foreign keys, so dropping legacy tables cannot cascade.
Orphaned classifier sessions are retried through a dedicated cleanup action
because the former global clear no longer exists. Evidence and open live checks:
[application report](../verification/application.md#durable-chats-and-planning-handoffs--2026-11-03).