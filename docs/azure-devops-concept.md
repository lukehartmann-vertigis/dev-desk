# Azure DevOps Structure and Workspace Scope

Date: 2026-10-26

Status: scoped metadata exploration completed; product scope and approval rules
confirmed. Runtime permissions and complete group resolution remain unverified.

## 1. What the entities mean

```text
Organization
    Project
        Work items
        Teams
            Board/backlog views using area paths and iterations
        Git repositories
            Pull requests
```

- A project is the common container, not a repository.
- A work item belongs to a project. A team's Board is a configured view over
  project work, not an independent repository-owned work-item store.
- Area paths determine a team's work scope; iteration paths support planning.
- A repository stores code; a PR belongs to one repository.
- A work item can be unlinked or related to changes in several repositories.
  Repository names and team names do not establish that association.
- A team is not synonymous with every security or directory group that can be
  assigned as a PR reviewer.

## 2. Observed structural behavior

Read-only MCP operations were limited to project/repository metadata, the
authenticated account's teams, and those teams' settings.

| Observation | Evidence and limit |
| --- | --- |
| Project discovery | Paginated discovery was inspected; this was not a complete organization inventory |
| Focus | The user selected the initial workspace documented below |
| Repositories | Paged discovery distinguished enabled and disabled repositories; live inventory details and counts are omitted |
| Team membership | The `mine` team query returned team scopes; this does not prove all group memberships |
| Area rules | Observed team settings support single and multiple area scopes; they do not establish repository ownership |
| API scope | No work-item bodies, PR discussions, code files, repository clones, or credential values were retrieved |

Only structural conclusions are retained for publication. Live team names, area
paths, membership details, inventory counts, personal identity records, and raw
MCP responses are omitted. The configured initial profile below is separate
from those live observations; its identifiers also require approval before
public sharing. Live repositories and team settings can change.

The MCP credential's access is not proof that the future application PAT has
identical permissions.

## 3. Confirmed initial workspace

| Concern | Decision |
| --- | --- |
| Project | Utilities |
| PR repository allowlist | network-locator and Utilities |
| New repositories | Not included automatically |
| Work-item scope | All items assigned to the user in configured projects, across all states |
| Team/board filter | Not required in the MVP |
| Repository display | Informational legend and row colors; no display filter |
| Team-board display | PAT user's teams, matched by full area scopes; all matches shown without filtering |
| Todos | Independent of project/repository/team-board annotations |
| General capability | Multiple configured projects remain supported |

The two repository names identify the chosen initial profile, not hard-coded
product constants. Resolve and persist their stable IDs through validated server
configuration when implementation begins.

An enabled repository that is later disabled or inaccessible produces a visible
scope error and stale cache, not a silent replacement with another repository.
An empty allowlist never means “synchronize everything”.

The proposed environment encoding is a comma-separated repository UUID allowlist.
Its exact config representation remains an implementation detail; the explicit
selection policy is the confirmed product decision.

## 4. Personal and group review visibility

These rules apply only to active PRs in selected repositories. A positive vote
means approved or approved with suggestions.

Evaluate in this order:
1. If the user's current vote is positive, hide the PR from review requests.
2. Otherwise, if the user has an individual reviewer entry, retain it as an open
   personal request even if groups have approved.
3. Otherwise, find reviewer groups containing the user. With complete membership
   data, retain the PR if any relevant group has not approved; hide it only when
   every relevant reviewer group has approved.
4. If membership or required review data is incomplete, expose that condition.
   Do not claim completeness or infer approval from missing data.

An empty, complete set of matching individual/group reviewers means there is no
request for this user; it is not a vacuous “all groups approved” result.
Own-PR visibility is independent of review-request visibility.

### Required acceptance cases

These are specifications, not results from reading live PRs:

| Case | Expected result in review requests |
| --- | --- |
| Personal reviewer, no vote | Visible |
| Personal reviewer, waiting or rejected | Visible |
| User approved or approved with suggestions | Hidden |
| Personal unapproved entry plus approved relevant groups | Visible |
| Group-only request, one relevant group unapproved | Visible |
| Group-only request, multiple relevant groups, only some approved | Visible |
| Group-only request, all relevant groups positive | Hidden |
| Group-only request, group vote unknown | Not inferred satisfied; show incomplete/error state |
| Direct and group assignment on the same PR | One row, with assignment reasons |
| No matching reviewer, complete membership | Not a review request for this user |
| Previously positive vote reset to no vote | Re-evaluate on refresh; visible if the resulting request is open |
| Completed or abandoned PR | Hidden regardless of votes |

Group approval is not a claim that all branch policies/builds are satisfied or
that a PR is mergeable.

## 5. Group resolution: evidence versus remaining work

The exposed MCP metadata operations established team membership, not a complete
Graph traversal, all directory-backed memberships, or actual PR reviewer mapping.
No complete group list is inferred from the observed team scopes.

The official Graph membership endpoint documents:
- Upward membership lookup by subject descriptor.
- Only `depth=1` is supported per call; transitive membership requires explicit
  traversal rather than assuming one call returns every ancestor.
- The `vso.graph` read scope covers membership information.

Implemented adapter design, with live account parity still unverified:
- Resolve stable user/group descriptors and map them to reviewer identities.
- Traverse upward with duplicate/cycle protection and bounded work.
- Treat permission failures, traversal limits, or unavailable directory-backed
  membership as incomplete; retain freshness/error state.
- Revalidate membership with synchronization so changed access does not remain
  an invisible stale assumption.

Live acceptance must verify actual app PAT permissions, directory-backed behavior, group
identity conversion, and the review-vote fields used for the rules above.
Do not silently reduce the accepted group-review feature to direct reviewers.
If Azure DevOps cannot expose sufficient membership, report the blocker and
seek a scope/identity decision before claiming MVP acceptance.

The [partial G0 report](verification/g0.md#5-azure-devops-evidence-and-blockers)
also checks the public reviewer contract: positive votes are 5/10 and `votedFor`
describes group-vote roll-up. No app-specific PAT or live Graph/reviewer mapping
has been verified; existing MCP access must not be mistaken for that evidence.
The user subsequently lifted the up-front G0 blocker in
[ADR-0011](adr/0011-integrated-delivery-and-verification.md). Adapter implementation
and offline tests now exist; remaining live evidence is tracked in the
[application report](verification/application.md), not silently treated as passed.

## 6. Why no board filter is needed now

The team settings demonstrate that Boards use area paths, not repository lists.
The selected product scope deliberately avoids recreating those Board views:
query assigned work project-wide and preserve each work item's actual state/type.

The user's later frontend refinement adds informational legends, not filters:
query the app PAT user's project teams with `$mine=true`, then each team's full
field-values contract, including `includeChildren`. Match exact paths or child
paths at backslash boundaries, case-insensitively, and show all overlapping
matches. Do not infer rules from previously observed MCP area names.

This is team-board **area scope**, not a claim that every type/state appears on a
particular board, column, backlog level, or iteration. Unknown area paths,
unmatched items, and unavailable/stale team metadata are explicit. Cache metadata
independently so a failed annotation refresh cannot discard assigned work or PRs.
See [ADR-0012](adr/0012-informational-legends-and-team-scopes.md).

## 7. Sources and related decisions

Official references checked during planning:
- [Graph memberships](https://learn.microsoft.com/en-us/rest/api/azure/devops/graph/memberships/list?view=azure-devops-rest-7.1)
- [PR reviewers and group-vote roll-up](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/list?view=azure-devops-rest-7.1)
- [Team field values and includeChildren](https://learn.microsoft.com/en-us/rest/api/azure/devops/work/teamfieldvalues/get?view=azure-devops-rest-7.1)
- [Current user's project teams and paging](https://learn.microsoft.com/en-us/rest/api/azure/devops/core/teams/get-teams?view=azure-devops-rest-7.1)

Related documents:
- [ADR-0009](adr/0009-ado-scope-and-review-visibility.md)
- [Azure DevOps requirements](requirements/azure-devops.md)
- [Frontend concept](frontend-concept.md)
- [Implementation and verification gates](implementation-plan.md)
