# Todo Management

Status and interpretation: [requirements baseline](REQUIREMENTS.md).
All behavior and acceptance contracts below are approved in baseline v1,
including concurrency and retry safety. They specify future implementation;
no application tests have run yet.

## TODO-001 — Quick creation

The user MUST be able to create an open todo using a single-line title input and
Enter. Titles are trimmed and contain 1–500 characters.
Descriptions and notes are outside the MVP.

Acceptance:
- Enter on a valid title creates exactly one record and clears the input only
  after the server acknowledges persistence.
- Focus remains in the input. Blank or oversized input shows an inline error and
  creates nothing. A persistence failure preserves the entered text.

## TODO-002 — Persistence without daily behavior

A todo MUST retain its identity and state until explicitly changed or deleted,
independently of calendar dates.

Acceptance:
- An open todo remains the same record after midnight, browser reload, and
  container restart.
- No day assignment, rollover, daily duplication, or date selection is required.

## TODO-003 — Completion

The user MUST be able to complete an open todo with its checkbox.

Acceptance:
- A successful update records completion and moves the item out of the open
  section.
- If the update fails, the UI does not present the item as durably completed.

## TODO-004 — Completed records

Completed todos MUST remain available until explicitly deleted.

Acceptance:
- A secondary, initially collapsed completed section lists records newest
  completion first, without grouping by day.
- Titles and external references survive reload and restart.

## TODO-005 — Reopening

The user MUST be able to reopen a completed todo.

Acceptance:
- Reopening keeps the same ID, clears the completion timestamp, and appends the
  item to the open list.
- It does not create a second todo or a historical daily copy.

## TODO-006 — Editing

The user MUST be able to edit a todo title and its optional external reference.

Acceptance:
- Saving applies the same title validation as creation; cancel preserves the
  previous record.
- Both open and completed todos are editable without implicitly changing status.

## TODO-007 — Deletion

The user MUST be able to permanently delete a selected todo after confirmation.

Acceptance:
- The dialog identifies the exact todo; cancel makes no change.
- Only the selected record is deleted. Missing or changed records produce an
  explicit result rather than an unqualified success.
- AI requests follow the additional approval rules in
  [AI-007](assistant.md#ai-007--confirmed-deletion).

## TODO-008 — Ordering

The user MUST be able to reorder open todos, with persistent ordering.

Acceptance:
- Both pointer and keyboard controls can move an open todo.
- Reload and restart retain the order.
- Reordering the open list does not reorder completed records.

## TODO-009 — External reference

A todo MUST support zero or one Azure DevOps work-item or PR reference.

Acceptance:
- The user can attach, replace, open, and remove the reference without changing
  the title or completion state.
- A reference includes enough organization/project/repository identity to avoid
  ambiguous PR IDs.
- Removing the association does not modify Azure DevOps.
- A missing/inaccessible external object is visibly unavailable; the local todo
  remains usable. Offline cached association is allowed but labelled unverified.

## TODO-010 — Concurrent changes

Mutations MUST detect stale writes rather than silently overwrite newer state.

Acceptance:
- Two browser tabs, or UI and AI acting on the same version, cause the later
  conflicting update to return a conflict and offer current data.
- Reordering checks a list revision; editing checks a todo revision.

## TODO-011 — Retry safety

A repeated mutation MUST NOT accidentally create another record or reapply a
previously committed side effect.

Acceptance:
- Repeating the same request ID and payload returns the original outcome.
- Reusing the ID with a different payload is rejected.
- A client retry after an interrupted response does not duplicate a todo.
- Application and assistant writes use the same transactional domain operations.
