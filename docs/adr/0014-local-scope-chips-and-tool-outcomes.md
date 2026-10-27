# ADR-0014: Local Scope Chips and Compact Tool Outcomes

Date: 2026-10-27  
Status: Accepted by explicit user instruction

## Context

The user requests further grouping inside the three counted ADO tabs, using
colored team/repository chips with the first active by default. Clarification
confirmed single selection, independent per-tab choices, all overlapping team
matches, and separate unmatched/unknown groups. Tool results should resemble
compact, expandable activity lines rather than large transcript bubbles.

This supersedes only ADR-0012's prohibition on local in-tab display grouping.
Its informational sidebar legends, team-area interpretation, independently
cached metadata, palettes, and complete upstream query scope remain unchanged.

## Decision

- Group cached work items by every matching team-board area scope and PRs by
  repository. Share one pure grouping function for membership and row markers.
- Use named native chip buttons with `aria-pressed`, per-group counts, existing
  scope colors, and readable text. Exactly one available chip is active, in
  stable legend order; the first is initially selected, even when empty.
- Retain selected identity separately for each tab for its mounted lifetime.
  If unavailable, display the first available group. Reload resets selection.
  Do not persist a display preference or add an All option.
- Append nonempty "No team" and "Assignment unknown" groups. Only fresh,
  successful metadata establishes no team match. Missing area metadata or
  unresolved/stale nonmatches remain unknown. Preserve last-good positive
  matches and stale warnings. Unexpected PR repository metadata stays reachable
  through "Repository unknown".
- Local selection changes no upstream reads, synchronization/allowlist scope,
  cached data, todo-reference choices, or agent context. Tab totals include all
  cached rows; team-group counts may overlap. Warnings are never filtered.
- Render tool messages as native, initially collapsed one-line disclosures.
  Summarize known action names and inspect `outcome.ok`, not just the transcript
  status. Show failed tools and pending deletion approval explicitly.
- Keep original literal payloads and timestamps inside expansion. Unknown text
  is explicitly unstructured rather than assumed successful. No Markdown/HTML
  execution, external requests, or tool action is triggered by rendering.

## Alternatives

- Multiselect or an All group: rejected in favor of the confirmed single-select
  interaction and first-chip default.
- Primary-team assignment: loses overlapping scopes and invents ownership.
- Provider-side filtering: changes accepted complete synchronization/context
  contracts and adds unnecessary reads on interaction.
- Large tool bubbles or truncated-only payloads: respectively retain the noise
  or remove durable evidence. Native disclosures preserve both compactness and
  complete keyboard-accessible details without a new dependency.

## Consequences

The initial visible rows are intentionally a subset of a complete cached tab.
Fallback chips keep uncertain/unmatched rows reachable, while total count bubbles
continue to communicate complete cached data. Grouping and transcript layout add
no migration, wire-contract change, dependency, or mutation authority.

## Verification

See the [application report](../verification/application.md),
[grouping tests](../../src/components/dashboard/devops-groups.test.ts),
[tool-summary tests](../../src/components/dashboard/tool-outcome.test.ts), and
[browser acceptance](../../tests/e2e/).
