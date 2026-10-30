# Azure DevOps Integration

Status and interpretation: [requirements baseline](REQUIREMENTS.md).
All behavior and acceptance contracts below are approved in baseline v1,
including scope, review semantics, synchronization, and failure contracts.
Complete group resolution and actual app PAT permissions remain technically
unverified live. The real adapter and offline contracts are implemented; see the
[application report](../verification/application.md). ADR-0011 removes the
up-front G0 blocker, not these acceptance obligations.

The implemented [settings increment](settings.md) replaces environment-owned
scope in ADO-001/ADO-003 and supplies the effective scope for ADO-011.
Review/group semantics and read-only access remain unchanged.

## ADO-001 — Connection scope

The application MUST connect to one Azure DevOps Services organization and an
explicit source selection using a server-side PAT.

Acceptance:
- Two projects and selected repositories can be synchronized.
- Only selected team areas and explicitly selected repositories contribute content.
  Newly discovered repositories are not automatically added to PR synchronization.
- New and upgraded installations start empty; no legacy scope is imported.
- Either source list may be empty; empty never means all.
  A disabled or inaccessible selected repository produces an explicit scope error.
- PAT permissions are read-only and least-privilege; no token reaches the browser.
- Azure DevOps Server and multiple organizations are not supported in the MVP.

## ADO-002 — Current user identity

The application MUST resolve the authenticated PAT user's Azure DevOps identity
for assignments, authored PRs, and review requests.

Acceptance:
- Filtering uses stable identity, not display-name equality.
- If an optional configured email does not match the authenticated user, the
  integration reports a configuration problem rather than showing another
  person's data.
- Identity failure leaves local todos and existing cache available.

## ADO-003 — Assigned work items

The dashboard MUST show work items assigned to the current user within selected
team-board area scopes, independently of work-item type.

Acceptance:
- Each row shows ID, title, type, state, priority, project, and an external link.
- Custom types and states are retained. Missing priority is displayed as
  unavailable, never invented.
- The MVP does not silently exclude terminal states based on guessed state names.
- Team membership and repository selection do not restrict candidate board
  selection. The selected boards' area union restricts assigned work.
- Discover all readable teams (`$mine=false`), not only the user's memberships.
  Resolve selected teams' `System.AreaPath` field-values with `includeChildren`.
  Match paths case-insensitively at path boundaries and display every matching
  team-board scope. This describes area scope, not exact board/type/column or
  iteration visibility. Unmatched/unknown items cannot bypass selected scope;
  local grouping operates only on the eligible dataset.
- Persist team scopes independently of work-item snapshots. Permission, paging,
  and metadata failures retain last-good mappings, mark them stale, and leave
  local todos and independently readable sources available. Last-good positive
  matches may remain stale; unresolved areas never grant project-wide work.
  Older cached work items without area metadata are not proof of inclusion.
- Within the selected team, group assigned items by board and swimlane in
  initially expanded, keyboard-operable disclosures with item counts. Read all
  of that team's boards, their type/state mappings, and each board's own lane
  field; do not use the generic last-board `System.BoardLane` value.
  Preserve board/lane order and use the zero-ID default lane for empty values.
  Unmapped types/states and unavailable lane assignments remain visible in
  explicit fallback groups. Grouping does not narrow synchronization or totals.
- Cache swimlane assignments separately per selected team. Failures retain the
  last successful assignments with their timestamp, error and stale warning;
  work-item and PR refreshes remain independent. Old caches without swimlanes
  render an unavailable group until the next successful refresh. This is
  type/state/lane grouping, not a claim of exact live board/filter visibility.

## ADO-004 — Review requests

The dashboard MUST show active PR review requests for the current user directly
or through a team/group, unless the user has already approved the PR.

Acceptance:
- Each row shows title, repository, project, author, the user's review vote/state,
  draft indicator where applicable, and a direct link.
- Expandable review votes use status-colored chips with icons and explicit text:
  approvals (including suggestions) are green, waiting for author is yellow,
  rejection is red, and no vote or unavailable/unknown votes are gray.
  Group reviewers appear side by side in the first row, individual reviewers in
  the second row; rows wrap on narrow screens and empty reviewer groups are omitted.
- Completed/abandoned PRs are excluded. The user's approval or approval with
  suggestions hides an active PR from review requests; no vote, waiting, or
  rejection does not count as approval.
- Group-derived requests are included according to
  [ADO-012](#ado-012--team-and-group-review-identity). User votes and group votes
  are distinguishable. A group-only request is hidden once all relevant reviewer
  groups approve or approve with suggestions.
- If a personal reviewer entry is still unapproved, group approval alone does
  not hide that personal request. The user's own positive vote hides the request
  as above. An unknown group outcome or incomplete membership cannot establish
  that the request is satisfied.
- Review requests and own PRs use the configured repository allowlist. Repository
  sidebar legends and matching row markers remain informational. In-tab chips
  filter the local presentation by repository without restricting sync, changing
  dataset totals, or hiding data from todo-reference selection and chat tools.

## ADO-005 — Own pull requests

The dashboard MUST show active PRs authored by the current user.

Acceptance:
- Each row shows title, repository, project, active/draft state, review votes,
  and a direct link.
- Individual required-reviewer indicators are preserved where provided.
- Review votes use the same grouped, status-colored chips as review requests.
- Votes are not misrepresented as a guarantee that branch policies allow merging.
- Build status and merge-conflict detection are not fetched for the MVP.

## ADO-006 — Periodic synchronization

Synchronization MUST run in the server independently of open browser tabs.

Acceptance:
- A sync is requested after startup without blocking the todo dashboard on Azure
  DevOps. The next cycle starts after the configured delay following completion.
- Default delay is 180 seconds; only integer values from 30 to 3600 are valid.
- Opening more tabs does not create extra upstream polling coordinators.
- Scheduled and manual runs never overlap the same synchronization cycle.

## ADO-007 — Manual refresh

The user MUST be able to request refresh without waiting for the next scheduled
cycle.

Acceptance:
- The dashboard immediately shows queued/running state and later the outcome.
- A request during a running cycle joins that cycle rather than starting another.
- All relevant sections update from committed local results, including other
  visible browser tabs within the local-refresh interval.

## ADO-008 — Persistent cache and freshness

Fetched dashboard data MUST be cached in SQLite and expose its freshness.

Acceptance:
- Restart can render the last successful data without first contacting Azure
  DevOps.
- Each section exposes last successful sync and current error/refresh status.
- A scope is stale after twice the configured polling interval or a failed latest
  attempt; a section containing any stale scope is marked stale.
- “No matching items”, “never synchronized”, and “failed with old data” are
  distinguishable.

## ADO-009 — Complete and isolated refreshes

A successful scope refresh MUST include all pages and batches before replacing
its prior snapshot.

Acceptance:
- Multi-page projects, repositories, PR lists, work-item queries, and comments
  used on demand are handled according to their endpoint's paging/limit contract.
- If an API limit prevents complete retrieval, the result is explicitly incomplete
  and is not published as a successful complete snapshot.
- Failure of one project/repository/dataset retains that scope's old snapshot;
  successfully refreshed independent scopes can still update.
- A complete empty response removes obsolete entries; an error does not empty
  the cache.

## ADO-010 — Recoverable failures

Upstream timeouts, throttling, and authentication errors MUST be explicit and
bounded.

Acceptance:
- Reads have timeouts and bounded retries for transient failures, respecting
  `Retry-After`.
- Unauthorized or forbidden reads do not trigger an endless retry loop.
- Cached rows remain visible with the failed scope identified.
- Fixing credentials/configuration and restarting permits synchronization again.

## ADO-011 — Read-only details

The server MUST support on-demand work-item and PR detail/discussion reads for
the assistant, within configured scope.

Acceptance:
- Authorized reads can obtain title, description, relevant fields, PR reviewers,
  and discussions without cloning repositories or retrieving code diffs.
- Cache-only versus live results and retrieval timestamps are identifiable.
- Inaccessible, out-of-scope, or incomplete data is not replaced with fabricated
  summaries.
- No app route or AI tool exposes an Azure DevOps write operation.

## ADO-012 — Team and group review identity

Review request discovery MUST include reviewers that are teams/groups containing
the current user, not only explicit individual assignments.

Acceptance:
- Membership is resolved through stable identities, independently of repository
  names, board names, and display-name matching.
- A PR matching both direct and group assignment appears once, with its assignment
  reason available to the UI.
- Membership lookup has freshness/error state. Incomplete or inaccessible
  membership data is reported rather than labelled a complete review list.
- Nested membership must be traversed and identities mapped to reviewer records
  without assuming that the MCP list of the user's teams is all their groups.
- Actual directory-backed group visibility, required read scopes, traversal
  completeness, and identity conversion must be verified under OPEN-08/G0.
  Failure to establish completeness remains visible rather than silently
  degrading to direct-review-only results.

See the [Azure DevOps concept](../azure-devops-concept.md) for evidence limits,
approval cases, and the distinction between teams, Boards, and repositories.
