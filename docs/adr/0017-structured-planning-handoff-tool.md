# ADR-0017: Single-Agent Structured Planning Handoff Tool

Date: 2026-11-03
Status: Accepted for the explicitly approved single-agent, schema-validated
handoff-tool approach. Separate implementation approval is pending. Not
implemented or verified.

Partially superseded by [ADR-0018](0018-independent-handoff-artifacts.md) on
2026-11-03 for chat-owned storage, provenance, rendering references, and deletion
lifecycle. The original decision below is preserved as history. The single-agent
tool, validation, replay protection, and capability restrictions remain accepted.

Subsequent plan approval (2026-11-03): the user approved the documented combined
plan, including ADR-0016's SDK lifecycle and ADR-0018's independent-artifact model.
References below to ADR-0016 being proposed describe the earlier decision stage,
not its current status. Separate implementation approval remains pending.

## Context

The approved planning increment needs a copyable, self-contained work-item
planning request inside durable chat history. The user considered a separate
handoff agent, then explicitly selected the existing chat agent plus an
application-defined tool. The agent formulates content; the application validates,
persists, renders, and exports an identifiable result.

See [AI-014 through AI-017 and AI-023](../requirements/assistant.md#planning-handoff-increment)
and the separately approved
[chat-history concept](../requirements/assistant.md#durable-chat-history-increment).
The baseline only allowlists local todo and read-only Azure DevOps tools. This
increment therefore needs an explicit, narrow local chat-artifact capability,
not an implicit expansion of the general mutation permission.

## Decision

- Use one existing chat agent and an application-defined
  `create_planning_handoff` tool. Do not introduce another agent, model conversation,
  autonomous delegation, or filesystem/editor access for handoff creation.
- Accept a bounded structured payload for the work-item planning content. Validate
  required sections and types server-side. Derive chat/run ownership, artifact
  and operation identities, canonical links, and retrieval metadata from validated
  server context; recheck current source scope rather than trusting model values.
- Persist a typed handoff entry inside the owning conversation and acknowledge
  success only after commit. This is not a separate archive or workflow store.
  Replays of the same operation return the committed result; conflicting reuse
  fails. Explicit user revisions produce new entries without erasing old ones.
- Render and export from the stored structured entry. The application supplies
  planning-only instructions and source-trust warnings in deterministic Markdown.
  Do not identify handoffs by matching ordinary assistant Markdown headings.
- Treat successful tool commit separately from surrounding assistant prose. A
  later stream interruption does not roll back or hide a committed artifact;
  partial arguments or failed commits are not complete handoffs.
- Authorize the capability for explicit handoff requests without also enabling
  todo mutation/deletion tools. Clarify ambiguous requests. Retain the shared run
  budget, cancellation guards, current source selection, and create/resume
  allowlist verification. Intent classification is not a deterministic guarantee
  of user intent; server checks enforce ownership and hard capability limits.
- Keep copying as a browser action. Handoff creation, display, and copying do not
  open VS Code, submit a prompt, grant implementation approval, or change any
  local repository or Azure DevOps object.

This extends AI-008/AI-009 only for creation of a local chat artifact. The
[Copilot/provider decision](0003-copilot-assistant.md), authentication policy,
todo-deletion safeguards, and host/external-write prohibitions remain unchanged.
Multi-conversation migration and SDK lifecycle remain proposed separately in
[ADR-0016](0016-durable-chat-history.md); approving this decision does not accept
that detailed architecture or authorize either increment's implementation.

## Alternatives considered

- Ordinary assistant Markdown with a copy button: adequate for informal text,
  but lacks an explicit validated artifact identity and committed-result boundary.
- A structured final assistant response without a tool: viable for display-only
  output, but does not itself define transactional creation, replay behavior, and
  recovery independently of the final assistant stream.
- A separate handoff agent: adds context transfer, orchestration, and potentially
  additional model calls without a distinct permission set or lifecycle need.
- A tool that opens or writes into the target repository: crosses a new trust
  boundary and exceeds the approved manual-handoff scope.

## Consequences

- Requires a bounded schema, typed transcript/API representation, scoped handler,
  replay protection, deterministic export, and a renderer in the current chat UI.
  Concrete SDK encoding and database representation must follow existing local
  conventions; this decision does not prescribe a second persistence system.
- The same agent retains conversational context. Formal validation improves
  structural reliability but does not establish factual accuracy or eliminate
  malicious-source/model risks; source attribution and user review remain needed.
- Exact tool inventories and capability selection change for handoff requests.
  Tests must establish that creating a handoff does not grant todo-write, shell,
  repository, editor, delegation, or Azure DevOps write capabilities.
- Historical handoffs remain readable and copyable without Copilot. Conversation
  deletion and backup/restore own these entries alongside the other chat records.

## Approval and verification

The user explicitly approved this approach on 2026-11-03 after discussion of the
single-agent/tool split, structured validation, ownership, replay protection, and
permission separation. This is architecture/concept approval, not separate
implementation authorization or test evidence.

Follow the [implementation and verification plan](../requirements/assistant.md#planning-handoff-increment).
Record actual evidence in the [application report](../verification/application.md)
against AI-014 through AI-017 and AI-023. Planned checks include invalid payloads,
forged ownership/provenance, unauthorized sources, replay and conflicting input,
failed persistence, cancellation, a committed artifact followed by stream failure,
create/resume isolation, history reload, and exact clipboard output/failure.
All checks remain unperformed for this increment; live SDK/account and browser
acceptance are distinct from offline fixtures.

Implementation (2026-11-03): delivered with a fourth classifier intent, `handoff`,
which exposes read tools plus `create_planning_handoff` but no todo mutation tools.
The handler requires the work item to have been read in the same run, rechecks
the settings revision and scope, and derives retrieval time from that read.
Evidence: [application report](../verification/application.md#durable-chats-and-planning-handoffs--2026-11-03).