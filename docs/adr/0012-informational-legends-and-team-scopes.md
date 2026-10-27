# ADR-0012: Informational Legends and Team-Board Area Scopes

Date: 2026-10-27  
Status: Accepted by explicit user instruction

## Context

The user removed the need for PR repository filters and requested colored
repository and board legends with matching row markers, following the unchanged
[clickdummy](../../clickdummy.html).

ADO work items belong to projects, not uniquely to boards or repositories.
Asked which classification to display, the user selected their own ADO teams'
board scopes based on area paths, including every match when scopes overlap.

## Decision

- Replace repository display controls with informational legends. Keep the
  server-side repository allowlist and project-wide assigned-work query.
- Read the authenticated PAT user's teams within each configured project using
  `$mine=true`, paginating with `$top`/`$skip`.
- Read each team's `System.AreaPath` field-values, including `includeChildren`.
  Match case-insensitively; descendant matching requires a path boundary.
- Show all matching team scopes with names and consistent colors. Do not invent
  a primary board, repository association, or missing area path.
- Label these as area scopes, not exact board columns, work-item-type visibility,
  backlog levels, or iterations. Unmatched and unknown items remain visible.
- Persist team scopes separately in existing SQLite metadata. Publish only a
  complete project mapping; retain last-good scopes with explicit errors and
  freshness after denied access, invalid metadata, or incomplete paging.
- Use the same cached metadata in dashboard and assistant reads.

This supersedes only ADR-0009's repository display controls, not its integration
scope or review semantics. No additional PAT permissions beyond the documented
Project and Team / Work Items read access are intended.

## Alternatives

- Project or repository names as board names: incorrect ownership model.
- Area paths alone: accurate but not the user's selected team-board labels.
- One guessed board per work item: loses legitimate overlapping scopes.
- Reconstruct exact board visibility for all types/iterations: unnecessary for
  the agreed area-scope annotation and risks excluding assigned work.
- Filter assigned work by team membership: explicitly not selected.

## Consequences

Team metadata adds bounded read-only requests per sync. Annotation failures are
visible but do not invalidate successfully cached work items or PRs. Older cached
work items lacking area paths show unknown mapping until the next successful
work-item refresh. Colors are supplementary to text and deterministic by stable
ID order within each legend; they are not user-configurable identity storage.

## Verification

Adapter tests cover team pagination, overlapping and descendant area rules,
path boundaries, cache recovery/isolation, permission failures, and old snapshots.
Browser acceptance covers informational legends, matching dot/edge colors, all
matches, unknown/stale mapping, Enter/IME behavior, and independent scrolling.
Actual results and live limitations belong in the
[application report](../verification/application.md).
