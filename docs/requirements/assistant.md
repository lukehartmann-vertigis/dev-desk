# Assistant

Status and interpretation: [requirements baseline](REQUIREMENTS.md).
AI-001 through AI-013 are approved in baseline v1.
Automatic intent classification and its residual risk remain as selected.
The real SDK adapter and offline tests are implemented; see the
[application report](../verification/application.md) for results and remaining
live account checks. Approval is not proof of those capabilities.

AI-014 through AI-017 and AI-023 describe the separately approved
[planning handoff concept](#planning-handoff-increment); implementation is not
authorized, and these requirements are not implemented or verified.

AI-018 through AI-022 describe the separately approved
[durable chat history concept](#durable-chat-history-increment), added to the
planning scope on 2026-11-03. Implementation approval is pending; these
requirements are not implemented or verified. The historical single-conversation
contracts below remain the baseline, not the intended limit of the new increment.

AI-024 through AI-027 document the subsequently approved
[independent handoff and ownership model](#independent-handoff-artifacts-increment).
They replace chat-owned artifact storage and deletion for the planned increments,
not the single-agent/tool approach. Implementation approval is still pending.

Combined-plan approval: on 2026-11-03 the user explicitly approved the documented
scope, architecture, implementation order, and planned verification for AI-014
through AI-027, including ADR-0016's SDK lifecycle and ADR-0017/ADR-0018's current
decision boundaries. This closed the planning/architecture gate.

Delivery status (2026-11-03): the user then explicitly submitted the prepared
implementation request for this combined scope. AI-014 through AI-027 are
implemented. Offline, browser, and production-image evidence and the remaining
live account checks are recorded in the
[application report](../verification/application.md#durable-chats-and-planning-handoffs--2026-11-03).
Statements below that implementation is pending describe the earlier planning
stage and are kept for traceability.

The implemented [settings increment](settings.md) makes new Azure DevOps retrieval
and reference checks use persisted source selection. It does not add settings
mutation tools, code access, or coding execution, and it does not erase
historical chat context. Current-scope checks apply independently of old messages.

## AI-001 — Copilot integration

The assistant MUST use the GitHub Copilot SDK on the server with an explicitly
configured account token and model.

Acceptance:
- Credentials never enter a browser response, chat message, or application log.
- Unsupported models, expired tokens, policy restrictions, and exhausted usage
  allowances produce actionable errors.
- There is no silent switch to another model, provider, or ambient host login.

## AI-002 — Persistent conversation

The application MUST preserve one conversation's user messages, completed
assistant messages, and structured tool outcomes across reload and restart.

Acceptance:
- The user can read the stored conversation with Copilot temporarily unavailable.
- Restart permits continuation with restored SDK context and freshly registered
  tools and permission policy.
- Interrupted responses are marked interrupted, not displayed as complete.
- Failed resume does not erase the transcript or silently start a context-free
  continuation.

## AI-003 — Contextual assistance

The assistant MUST answer natural-language questions using local todo state and
explicitly retrieved Azure DevOps data.

Acceptance:
- “What should I focus on?” can combine todos, assigned work, and review requests.
- Suggestions are not executed merely because the assistant generated them.
- Answers distinguish retrieved facts from recommendations and include source
  links and freshness when discussing Azure DevOps objects.

## AI-004 — On-demand retrieval

The assistant MUST be able to retrieve relevant details and discussions during a
user-requested conversation.

Acceptance:
- Summarizing work item #1234 or a PR discussion invokes an authorized detail
  read when cache data is insufficient.
- A PR ID without enough repository context triggers disambiguation.
- Missing permissions, truncation, unavailable services, and partial context are
  surfaced; incomplete discussion summaries are labelled incomplete.
- Normal background polling does not send data to Copilot.

## AI-005 — Direct todo creation

The assistant MUST be able to create a local todo, optionally with an external
reference, without a separate confirmation dialog.

Acceptance:
- An explicit user request creates a validated todo through the normal domain
  service and reports the committed result.
- An invalid reference or title produces a visible error, not a success message.
- Replay of the same tool operation does not create another todo.

## AI-006 — Direct todo updates

The assistant MUST be able to edit, complete, reopen, or reorder local todos
without a separate confirmation dialog when the user's instruction is explicit.

Acceptance:
- Updates use stable IDs and current revisions.
- Ambiguous references such as “the refactoring todo” with several matches
  produce a clarification instead of an arbitrary selection.
- A conflict reports current state and requires a fresh decision, not a blind
  overwrite.

## AI-007 — Confirmed deletion

The assistant MUST NOT delete a todo without a separate UI confirmation bound to
that exact operation.

Acceptance:
- A deletion request produces a server-owned approval record identifying the todo,
  displayed title, revision, originating run, and expiry.
- Text such as “yes” from a model or an external discussion cannot approve it.
- Confirming once deletes only that version of that todo. Changed, expired,
  cancelled, or already consumed approvals cannot authorize another deletion.
- Rejecting or letting the 5-minute approval expire makes no change. No bulk
  deletion tool is exposed.

## AI-008 — Bounded capability surface

Only application-defined, explicitly allowlisted tools MUST be available to the
assistant.

Acceptance:
- Available tools cover local todos and read-only Azure DevOps access only.
- Built-in shell, filesystem, browsing, code-editing, autonomous delegation,
  remote-session sharing, MCP, and skill/plugin loading are disabled.
- Unknown tools and runtime permission requests are denied by default.
- Restrictions are reapplied and tested on both creation and resume.

## AI-009 — Untrusted content

External descriptions, comments, titles, and model output MUST be treated as data,
not executable instructions.

Acceptance:
- A PR comment requesting token disclosure, shell execution, or todo deletion
  cannot gain those capabilities.
- The application automatically classifies the current user request as read,
  mutate, or clarify without a user-facing write-mode switch. Read and clarify
  decisions expose no mutation tools; an uncertain decision asks the user.
- A mutation decision enables only permitted local todo operations, never Azure
  DevOps writes or approval of deletion. Tool handlers enforce scope and inputs.
- Model-provided URLs and IDs are validated against configured Azure DevOps scope.
- Safety is enforced in server handlers, not only by prompt instructions.

The user accepted the residual risk of automatic intent misclassification:
a read-only question might be incorrectly classified as a mutation request.
This is not presented as a guaranteed read/write boundary. Model-assisted
classification and restricted tools reduce, but cannot eliminate, unintended
non-delete updates. Hard capability limits do not depend on that classification.
See [ADR-0007](../adr/0007-automatic-ai-intent.md).

## AI-010 — Visible execution

Tool execution and assistant streaming MUST expose their actual outcome.

Acceptance:
- The UI distinguishes generating text, running tools, waiting for deletion
  approval, completion, interruption, and failure.
- Todo views update after a committed AI mutation.
- A stream failure does not roll back an already committed todo change or cause
  it to be replayed automatically.
- Tool outcomes are rendered as structured records, not trusted model claims.

## AI-011 — Bounded runs

The server MUST limit and permit cancellation of assistant work.

Acceptance:
- There is at most one active run for the single conversation.
- Limits are 120 seconds and 10 tool invocations per run, including any intent
  classification work within the same request budget.
- Cancel, timeout, client disconnect, or shutdown stops further tool dispatch and
  marks unfinished work interrupted; already committed mutations remain recorded.
- An ambiguous mutation intent requires user clarification before enabling writes.

## AI-012 — Data minimization

Only context relevant to the current request MUST be supplied to Copilot.

Acceptance:
- The UI explains that selected todo/work-item/PR content leaves the machine for
  Copilot processing, under the user's account and organizational policies.
- PATs, environment variables, unrelated project data, source-code diffs, and
  repository files are never included as chat context.
- The SDK runtime receives a minimized environment, not the app's Azure DevOps PAT.
- Context size is bounded; omitted content is disclosed rather than silently
  described as a complete record.

## AI-013 — Conversation clearing

The user MUST be able to clear the conversation after confirmation.

Acceptance:
- Clearing cancels active runs, invalidates approvals, and removes application
  messages, associated chat/tool payloads, and the corresponding SDK session state.
- A failed cleanup is reported as pending/failed, not “all data deleted”.
- A new conversation cannot resume the cleared context.
- This removes local live data, not previously created backups or provider-side
  records governed by GitHub's retention policies.

## Planning handoff increment

Date: 2026-11-03

Status: **Concept approved; documentation requested on 2026-11-03.
Implementation authorized and delivered on 2026-11-03; see the delivery status
above. Live account acceptance remains open.**

The user approved a small first step: prepare a self-contained, copyable planning
request in DevDesk, then manually submit it in the appropriate VS Code workspace.
These are this increment's acceptance contracts, not new baseline v1 obligations.
Concept approval and the request to document it do not authorize implementation.

On 2026-11-03 the user additionally approved using the same chat agent with a
schema-validated `create_planning_handoff` tool rather than a second agent.
See AI-023 and [ADR-0017](../adr/0017-structured-planning-handoff-tool.md).
This is approval of the approach, not separate implementation authorization.

The user subsequently approved independent versioned handoffs, precise
message/run provenance, and direct conversation ownership of messages on
2026-11-03. [ADR-0018](../adr/0018-independent-handoff-artifacts.md) replaces only
ADR-0017's chat-owned storage and retention rules. The contracts below reflect
this latest scope; the historical decision remains available for traceability.

### Scope and non-goals

Included: explicit chat requests, scoped work-item details and discussions,
available acceptance criteria, user-supplied context, and a distinct handoff with
a copy action inside the existing conversation. The existing agent formulates
the content; an application-defined tool validates and persists a typed handoff
version; the application renders it and produces copyable Markdown. The chat
contains a typed reference to that same stored version. No second
agent, additional model conversation, or autonomous delegation is introduced.

The subsequently approved [chat history increment](#durable-chat-history-increment)
adds independent conversations. The later
[artifact increment](#independent-handoff-artifacts-increment) adds a dedicated
handoff overview, immutable versions, and retention independent of the source chat,
in the existing SQLite database rather than a second storage system.

Excluded: local checkout mappings or new settings; filesystem or source-code
access; automatic editor opening or prompt submission; branches, worktrees,
commands, implementation, or autonomous delegation; Azure DevOps writes; job
tracking, progress synchronization, or implementation-approval workflows.
The user chooses the target workspace and reviews and submits the request there.
This increment does not implement the later "implement this" workflow.

### AI-014 - Explicit, scoped handoff preparation

The assistant MUST prepare a planning handoff only on an explicit user request,
using authorized work-item context.

Acceptance:
- A request such as "Prepare a planning handoff for ticket 1234" retrieves the
  identified work item's current details and discussions within committed source
  selection. Ambiguous identities trigger clarification rather than a guessed
  project, URL, or ticket.
- Include available acceptance criteria from the work item's dedicated field in
  the authorized detail result. Missing criteria are identified as missing; do
  not invent criteria or claim that all projects expose the same fields.
- The user can add or revise constraints, notes, and an optional target repository
  through the conversation. These are user declarations, not verified checkout
  identities; an unspecified repository remains explicitly unspecified.
- Denied/out-of-scope reads, upstream failures, missing fields, stale scope, and
  truncated context are disclosed. Failed reads do not become fabricated ticket
  facts or a purportedly complete handoff; usable partial context is labelled.
- Preparing or revising the handoff does not itself mutate todos or source
  selection, broaden access, or write to Azure DevOps.

### AI-015 - Self-contained planning request

The handoff MUST be understandable without access to the DevDesk conversation.

Acceptance:
- Include ticket identity, title, canonical source link, retrieval time, goal and
  relevant description, discussion conclusions, and available acceptance criteria.
  Missing, uncertain, or omitted information is explicit.
- Distinguish retrieved facts and criteria from user additions, proposed criteria,
  assumptions, and open questions. Do not present an unverified technical approach
  as a plan established by reading the repository.
- Include the optional user-named repository and relevant constraints; do not
  infer a checkout from the PR-source selection or request secrets or environment
  contents as handoff context.
- Ask the receiving agent to read the target repository's instructions, inspect
  relevant code and tests, clarify blockers, and propose a solution and checks.
  State that this is a planning request, not implementation authorization, and
  that the target repository's approval workflow still applies.
- Identify ticket descriptions and discussions as untrusted source data, not
  instructions overriding repository rules or user approvals. The exported text
  does not guarantee compliance by the receiving agent.

### AI-016 - Copyable handoff in chat

The existing chat MUST show a clearly delimited handoff with an explicit copy
action.

Acceptance:
- Copy transfers the full plain-text/Markdown handoff, including source links,
  limitations, and the planning-only boundary, without unrelated chat messages or
  tool records. Never copy a visually shortened preview instead of the full text.
- Offer copying only for a validated, committed handoff entry, never for partial
  arguments or uncommitted assistant prose. Interruption before commit does not
  produce a completed handoff. A committed entry remains available even if later
  assistant text or streaming fails; incomplete source context remains labelled.
- Clipboard success is reported only after the browser confirms the write.
  Clipboard denial or unavailability produces a visible error and leaves the
  handoff available for manual selection.
- The action is keyboard accessible and has an English accessible name, visible
  focus, and a tooltip when icon-only. Content and controls remain usable at
  375px, 768px, and 1440px without horizontal overflow.

### AI-017 - Independent lifecycle and existing capability boundaries

Planning handoffs MUST remain accessible independently of their source
conversation without adding execution capabilities.

Acceptance:
- Completed handoff versions persist and remain copyable after reload or restart,
  including when Copilot is unavailable. Chat references and the handoff overview
  resolve the same stored version under AI-024 through AI-026.
- Starting, opening, clearing, or deleting a chat never removes independent
  handoffs. Chat removal detaches message/run provenance links; artifact removal
  requires its own confirmation. Neither operation erases text copied elsewhere.
- AI-008, AI-009, AI-011, AI-012, and current settings scope enforcement remain in
  effect, with only AI-023's bounded local chat-artifact capability added to the
  baseline tool surface. Handoff generation needs no filesystem, shell,
  editor-control, or delegation tools, nor additional Azure DevOps write or todo
  mutation permission.
- Copying neither opens VS Code nor submits a prompt, grants implementation
  approval, starts work, or asserts that the target repository has been inspected.

### AI-023 - Validated handoff creation tool

The existing chat agent MUST create handoffs through the application-defined
`create_planning_handoff` tool, not a second agent or Markdown-shape detection.

Acceptance:
- The agent supplies structured content for AI-015's sections. A server-owned
  schema validates field types, required sections, and bounded sizes before any
  completed handoff is persisted. Unknown or invalid payloads produce visible
  tool failure, not a success message or silently partial artifact.
- Chat/run ownership, artifact identity, operation identity, canonical source
  links, and retrieval metadata are derived from server-validated context, not
  arbitrary model-supplied values. Current source authorization is rechecked;
  a different chat or an invented source cannot be targeted through the payload.
- Atomically persist an independent handoff version and a typed reference in the
  originating tool-result message. Bind the version to the triggering user
  message and generating run under AI-027. Acknowledge success only after commit.
  Render/export the referenced snapshot, not adjacent prose or a duplicate payload.
- Repeating the same originating operation returns its committed artifact without
  a duplicate. Conflicting reuse of an operation identity fails. Explicit revisions
  append immutable versions to the selected handoff; ambiguous revision targets
  require clarification. Earlier versions and chat references remain unchanged.
- A handoff request permits only the scoped retrieval and local artifact creation
  it needs; it does not enable todo mutation or deletion tools. Ambiguous requests
  require clarification. Tool registration and handlers enforce this boundary on
  both session creation and resume; existing run guards and budgets still apply.
- Planning-only instructions and the untrusted-source warning are supplied by the
  application in rendering/export, not left to optional model wording. Copying is
  a browser action, not an SDK tool with host clipboard or editor access.
- Schema validation proves structure, not factual accuracy or source-content
  completeness. AI-014/AI-015's provenance and uncertainty requirements remain;
  prompt instructions and intent classification are not claimed as deterministic
  proof of user intent or immunity to malicious source content.

### ADR assessment

The initial plain-text/copy concept reused the existing Copilot, safe-Markdown,
and source-selection decisions. The subsequently approved typed, persisted tool
result merits [ADR-0017](../adr/0017-structured-planning-handoff-tool.md): it records
the single-agent choice, the bounded local capability extension to AI-008/AI-009,
and alternatives to a dedicated tool. Existing repository, host, and external
write prohibitions are unchanged; accepted ADR history is preserved.

The approved [ADR-0018](../adr/0018-independent-handoff-artifacts.md) partially
supersedes ADR-0017 for storage, provenance, and retention. It also refines the
message-ownership model in the accepted
[ADR-0016](../adr/0016-durable-chat-history.md). The user approved the documented
combined plan, including SDK lifecycle, on 2026-11-03. Separate implementation
approval remains pending; plan approval is not delivery or runtime verification.

### Implementation and verification plan

After separate implementation approval, an implementation-capable agent should:

1. Extend the existing work-item detail projection with available acceptance
   criteria while retaining scope rechecks, size limits, and missing-field
   behavior. Add focused adapter tests for present/absent criteria, failed or
   out-of-scope retrieval, and incomplete context (AI-014).
2. Add the bounded schema, independent handoff/version persistence, typed message
  references, and deterministic Markdown export in the existing database.
  Implement `create_planning_handoff` with server-owned provenance, current source
  checks, atomic version/reference creation, and replay protection. Test invalid
  fields, forged ownership/provenance, duplicate/conflicting operations, failed
  commits, and immutable user-requested revisions (AI-015, AI-017, AI-023, AI-024).
3. Extend the existing agent policy and tool registration for explicit handoff
  requests without granting todo writes or creating a second agent. Check
  clarification, malicious source text, current scope, cancellation and budgets,
  and the exact allowlist on create/resume. Include a committed handoff followed
  by a failed assistant stream (AI-014, AI-017, AI-023).
4. Render version references in chat and the independent handoff overview/detail;
  do not infer artifacts from Markdown headings. Verify exact copied text,
  clipboard success/failure, incomplete versus committed outcomes, older-version
  access, and independent chat/artifact removal (AI-016, AI-017, AI-023 through
  AI-027).
5. Run relevant existing adapter, chat, runtime-policy, and Markdown regression
   tests plus the repository's applicable lint, type, and build gates. Use
   synthetic fixtures for browser checks at the three required widths; do not
   read or mutate the live workspace as a test prerequisite.
6. Record actual results and remaining gaps in the
   [application report](../verification/application.md), linked to AI-014 through
  AI-017 and AI-023. Offline fixtures do not establish live Copilot behavior,
  PAT access, custom process-field availability, or clipboard support in the
  user's browser.

Live acceptance requires configured Copilot access, an explicitly selected and
readable test work item, and a browser permitting clipboard writes. Manually
review the generated handoff and paste it into the intended VS Code chat without
submitting implementation work. Confirm that it is self-contained and asks only
for planning. No live checks or implementation checks have been performed for
this increment; the next gate is separate implementation approval.

## Durable chat history increment

Date: 2026-11-03

Status: **Concept approved on 2026-11-03 after explicit clarification of separate,
reopenable conversations. Implementation authorized and delivered on 2026-11-03;
live account acceptance remains open.**

The user approved extending the planning scope with independent chats, a history
list with titles and last activity, reopening and continuation, durable retention,
and explicit confirmation before removal. Chats reference independently retained
handoff versions under the subsequently approved AI-024 through AI-027.
These are increment acceptance contracts, not claims about the existing runtime.

### Scope and relationship to baseline

AI-018 through AI-022 extend AI-002 from one conversation to multiple independent
conversations and refine AI-013's clearing boundary to a specifically identified
chat. The baseline's exclusion of multiple chat threads is lifted only for this
increment. AI-011's single active run remains application-wide, not per chat.
Todos and Azure DevOps settings remain shared application state; chat transcripts,
model context, run ownership, and pending approvals must not be mixed.

No search across chats, folders, tags, automatic summaries, cloud sync, bulk
removal is included. Independent handoff storage/navigation is separately included
under AI-024 through AI-026, without adding general chat search. History is
available while the local app and persistent storage are available, not when the
app is stopped. [ADR-0018](../adr/0018-independent-handoff-artifacts.md) records the
approved ownership model; SDK lifecycle details in
[ADR-0016](../adr/0016-durable-chat-history.md) were accepted in the subsequent
combined-plan approval. Separate implementation approval remains pending.

### AI-018 - Durable independent conversations

The application MUST persist each chat independently with a stable identity,
title, creation time, last activity, transcript, and continuation state.

Acceptance:
- User messages, completed assistant responses, structured tool outcomes, and
  handoffs survive reload, application restart, and container recreation with
  the persistent volume intact. Browser memory or provider retention alone is
  not the durable record.
- Starting a new chat creates independent context without clearing or replacing
  previous chats. A failed durable write is reported, not acknowledged as saved.
- No time-based expiry or automatic retention cleanup removes chats. Durability
  does not promise recovery after volume deletion or disk loss; existing backup
  and restore obligations cover the database and required SDK state.
- Existing transcript order, run associations, statuses, and handoffs are retained
  as one identifiable history entry on upgrade. Migration does not silently drop
  content, attach it to a new empty chat, or claim success after a storage error.

### AI-019 - History navigation

The chat surface MUST provide a history list for selecting saved conversations
and an explicit action to start a new one without deleting the current chat.

Acceptance:
- Entries show a title and last activity, newest activity first with stable
  ordering for ties. Opening a chat alone does not count as new activity.
- A title can be derived locally from the first user message, with an English
  fallback for an empty chat; generating a title requires no extra model call.
- Selecting an entry shows that chat's transcript and handoffs. Empty history,
  loading, and failed history reads are distinct; a read failure is not displayed
  as successful empty history.
- History remains within the existing chat surface, including its mobile drawer.
  New-chat and selection controls have English accessible names, keyboard access,
  visible focus, and remain usable at 375px, 768px, and 1440px.

### AI-020 - Reopening and isolated continuation

The application MUST allow reading and continuing a selected historical chat
without importing another chat's conversation or approvals.

Acceptance:
- Stored transcripts and handoffs can be read and copied while Copilot is
  unavailable. Continuing requires a functioning provider and reports failures
  without erasing history or silently substituting an empty SDK session.
- Resume restores only the selected chat's model context and reapplies current
  tools, permissions, source scope, and run limits. New chats do not receive other
  chats' messages; historical content cannot authorize newly out-of-scope reads.
- Stream events, late tool results, cancellation, and errors stay attached to
  their originating chat and run, even if a different chat is visible.
- Only one run may execute application-wide. While a run or its required cleanup
  is active, switching the active conversation or starting another requires it
  to finish or be explicitly cancelled and cleaned up first; no hidden parallel
  work or silent loss of the current draft occurs.
- Restart marks unfinished runs interrupted. Pending todo-deletion approvals
  remain bound to their originating chat/run and cannot authorize deletion from
  another chat; restart invalidation and expiry protections remain effective.

### AI-021 - Explicit, chat-scoped removal

Removing a saved chat or clearing its conversation MUST require an explicit UI
confirmation identifying the affected chat, without affecting other history.

Acceptance:
- Starting, opening, or continuing another chat never acts as deletion or clear.
  Dismissing confirmation leaves the chat and its continuation state intact.
- Confirmation is bound to the target chat, not a mutable current-selection
  pointer. A stale or changed target cannot cause another chat to be removed.
- Confirmed removal cancels the target's active work, invalidates its approvals,
  and removes its local messages, tool payloads, and associated SDK session state.
  Other chats, their SDK state, todos, settings, and independent handoff versions
  remain unchanged. Detach provenance links under AI-026 instead of cascading
  message/run deletion into the artifact store.
- Required cleanup failures are visible and retryable; pending cleanup is not
  reported as complete deletion, and removed context cannot resume meanwhile.
- The UI does not imply removal of backups, copied handoffs, or provider-side
  records. Model output or a ticket discussion cannot approve chat removal.

### AI-022 - Existing-history migration and recovery

The application MUST adopt the existing single conversation without data loss and
preserve the distinction between local history and resumable provider state.

Acceptance:
- A versioned, repeat-safe migration assigns existing runs and their messages to
  one stable conversation and preserves timestamps and completion/interruption
  states. Existing SDK state is associated only when its ownership is established.
- The migrated chat remains readable even when its SDK state cannot be restored.
  Continuation failure is explicit; it does not fabricate restored context or
  silently start an unrelated session under the old history entry.
- A failed migration follows the existing storage-failure contract and cannot
  expose a fresh empty history as successful adoption of the old conversation.
- Backup/restore includes conversation records and required per-chat SDK state.
  Interrupted startup, deletion cleanup, and restore never reassign orphaned
  messages or SDK sessions to an arbitrary chat.

### Implementation and verification plan

After separate implementation approval:

1. Add direct conversation ownership of messages and runs, with optional message
  run association and run-to-request-message links under AI-027, through a
  versioned migration and scoped APIs. Preserve existing messages, runs, and SDK
  mapping; test populated/empty databases, messages without runs, repeat startup,
  migration failures, and durable close/reopen reads (AI-018, AI-022, AI-027).
2. Scope SDK state, run dispatch, events, approvals, and cleanup by conversation.
   Retain one application-wide active run. Test two distinct chats, failed resume,
   interrupted restart, switch/cancel races, stale confirmations, and current
   create/resume tool isolation (AI-020, AI-021).
3. Add history navigation and new-chat controls to the existing chat surface;
  integrate references to independently stored handoff versions. Use synthetic
   browser fixtures to verify selection, titles/order, retention after reload,
   provider-down reading, keyboard/mobile behavior, clipboard outcomes, and
   confirmed removal of only the selected chat (AI-016, AI-019, AI-021).
4. Verify restart/container-recreation retention with a dedicated test database,
   SDK state directory, and persistent volume, never the user's live data. Include
   backup/restore and failed cleanup scenarios. Run applicable focused regressions,
   lint, type, and build gates, and update operational backup instructions as
   needed (AI-018, AI-022).
5. Link actual evidence and unperformed checks from the
   [application report](../verification/application.md) to AI-018 through AI-022.
   Real SDK continuation across restart and browser/account-dependent behavior
   require separate live acceptance; fixture success is not that evidence.

Implement conversation lifecycle before integrating handoffs into historical
chats; the work-item acceptance-criteria projection can be developed independently.
The combined plan and ADR-0016 are approved; there are no remaining planning or
architecture-approval blockers for this scope. Separate implementation approval
is still missing, and all checks above are planned rather than executed.

## Independent handoff artifacts increment

Date: 2026-11-03

Status: **Concept and relational ownership model approved; documentation requested
on 2026-11-03. Implementation authorized and delivered on 2026-11-03; live account
acceptance remains open.**

The user approved messages directly owned by conversations, runs as technical
execution attempts, and independent versioned handoffs with message/run provenance
that survive deletion of the source chat. This replaces the earlier chat-owned
artifact storage and retention rules, not the single-agent/tool choice. See
[ADR-0018](../adr/0018-independent-handoff-artifacts.md).

### AI-024 - Independent, immutable handoff versions

The application MUST store handoffs and their immutable content versions as
independent entities in the existing SQLite database.

Acceptance:
- A handoff has a stable identity; each version has its own identity, ordered
  version number, creation time, title, ticket identity/link, complete structured
  content, source retrieval times, and disclosed limitations. Content and source
  facts are snapshots, not values recomputed from messages or current ticket data.
- Explicit revisions append versions without overwriting earlier content or
  retargeting old chat references. A new handoff for the same ticket is not
  automatically treated as a revision; unclear targets require clarification.
- Chat, overview, detail, and clipboard output resolve the same version. Store
  the rendering/schema version or equivalent export information needed to retain
  the version's planning-only meaning and source warnings after application updates.
- Version creation, operation receipt, and the originating tool-message reference
  commit atomically. Failure leaves no successful artifact reference or partial
  version. Replayed operations return the original result, not a new version.
- Handoffs remain readable and copyable with Copilot or Azure DevOps unavailable,
  after source-chat deletion, reload, restart, and container recreation with the
  volume intact. They participate in backup/restore and have no automatic expiry.
- Saved snapshots are historical local data, not evidence of present source
  access or current ticket state. New retrievals/revisions obey current settings;
  opening a saved version does not fetch upstream or expand model context.

### AI-025 - Independent handoff discovery and retrieval

The application MUST provide a dedicated handoff overview and version detail,
without requiring navigation through the source conversation.

Acceptance:
- Entries show ticket identity, title, and creation/update information and are
  findable by ticket or title. Users can inspect the latest and earlier versions
  and copy the exact selected version under AI-016.
- Chat references open the specific stored version, not implicitly the latest.
  A provenance link opens the triggering message when available; otherwise its
  unavailability is explicit rather than a fabricated or broken chat destination.
- Loading, no saved handoffs, no matching entries, unavailable/deleted artifacts,
  and read failures are distinct. A failed read is not a successful empty overview.
- Navigation provides a return to the workspace and follows existing English UI,
  safe rendering, keyboard/focus, and 375px/768px/1440px responsive conventions.
  This adds no automatic VS Code opening, remote execution, or workflow status.

### AI-026 - Independent retention and confirmed removal

Chat removal MUST retain handoff artifacts; removing a saved handoff MUST require
its own explicit UI confirmation, independent of chat-clearing approval.

Acceptance:
- Chat removal clears its messages, runs, and SDK state under AI-021 but only
  detaches nullable handoff provenance links. No message/run deletion cascades
  into handoffs or versions. Snapshot content and version order remain intact.
- Chat-removal confirmation states that separately saved handoffs remain. Handoff
  removal identifies the exact handoff and affected versions; a stale selection
  or a changed version set requires a fresh confirmation, not broader deletion.
- Confirmed handoff removal deletes that artifact and its saved versions without
  deleting chats, other artifacts, todos, or source objects. Existing message
  references display an unavailable result, not a retained shadow payload or a
  silently substituted version. Cancellation leaves everything unchanged.
- Handoff removal does not erase discussion text already present in chats, copied
  exports, backups, or provider records. Do not promise tamper-proof audit storage
  or complete erasure of every mention. Model output cannot approve removal.
- Partial/per-version deletion, bulk deletion, and automatic retention cleanup
  are out of scope. The model-facing creation tool gains no deletion capability.

### AI-027 - Direct message ownership and precise provenance

Conversations MUST directly own messages; runs MUST describe execution attempts
rather than be the sole owner of transcript content.

Acceptance:
- Each message has a stable conversation identity and an optional run association.
  A user message can be durably stored before any provider run starts. Failure to
  start or retry an execution does not discard or duplicate that message.
- Each run belongs to one conversation and identifies its triggering user message.
  Multiple attempts may refer to that same message. Associated messages and
  approvals must belong to the same conversation; enforce these invariants in
  persistence/domain logic, not by accepting model-supplied ownership identifiers.
- Each handoff version records the triggering user message and producing run as
  nullable provenance references. Its originating tool-result message references
  that exact version. The source conversation is derivable through these records,
  not a substitute for precise message/run provenance or a source of copied content.
- Detaching provenance during chat deletion cannot change the immutable content
  snapshot. Reading an artifact requires neither the old message/run nor the SDK.
  Deleting an artifact leaves chat references visibly unavailable under AI-026.
- Migration retains existing message/run associations and ordering, adds direct
  conversation ownership, and does not infer handoff artifacts from ordinary
  historical prose. If known typed entries exist, adopt them explicitly without
  duplicating versions or leaving independent copies in authoritative storage.

### Implementation and verification plan

After separate implementation approval, use the following order across the
combined increments:

1. Migrate conversation/message/run ownership first; preserve the existing chat
   and SDK mapping. Add handoff/version storage, nullable provenance, message
   references, and durable operation receipts in the same database. Check foreign
   keys, same-conversation invariants, messages without runs, multiple attempts,
   empty/populated upgrades, repeat startup, and migration rollback behavior.
2. Implement the existing agent's bounded tool as one transaction for version,
   receipt, and message reference. Test invalid/forged input, scope changes,
   duplicate/conflicting replay, failed commit, explicit revisions, and cancellation
   before commit versus a committed artifact followed by stream failure.
3. Integrate exact-version rendering/export in chat and a dedicated handoff
   overview/detail with ticket/title lookup. Verify historical-version stability,
   source timestamps/limitations, unavailable provenance/artifacts, offline reads,
   clipboard success/failure, keyboard access, and all three viewport widths.
4. Verify chat deletion retains every version and detaches only provenance;
   verify separately confirmed artifact deletion removes its versions without
   affecting chats or other data. Include stale confirmations, concurrent revision
   attempts, cleanup failures, restart/container recreation, and backup/restore
   using disposable synthetic databases, SDK directories, and volumes.
5. Run relevant existing chat, policy, adapter, persistence, Markdown, and browser
   regressions and applicable lint/type/build gates. Record actual evidence and
   unperformed live SDK/PAT/browser checks in the
   [application report](../verification/application.md), linked to AI-014 through
   AI-027. Do not test against the user's live conversations or source content.

No implementation or functional checks have been performed. The next gate is
separate implementation approval for this combined scope. The user approved the
documented overall plan, including ADR-0016's SDK lifecycle and ADR-0018's ownership
and artifact model, on 2026-11-03. An implementation-capable agent may implement
and run the planned checks only after that separate authorization. Repository
access by DevDesk, implementation execution by DevDesk, additional agents, and
Azure DevOps writes remain out of scope.
