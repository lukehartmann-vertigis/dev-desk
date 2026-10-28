# Assistant

Status and interpretation: [requirements baseline](REQUIREMENTS.md).
All behavior and acceptance contracts below are approved in baseline v1.
Automatic intent classification and its residual risk remain as selected.
The real SDK adapter and offline tests are implemented; see the
[application report](../verification/application.md) for results and remaining
live account checks. Approval is not proof of those capabilities.

The [proposed settings increment](settings.md) makes new Azure DevOps retrieval
and reference checks use persisted source selection. It does not add settings
mutation tools, code access, or coding execution, and it does not erase
historical chat context. The baseline below remains the implemented contract.

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
