# ADR-0009: Explicit Repository Scope and Personal/Group Review Visibility

Date: 2026-10-26  
Status: Accepted

The repository display-control portion is superseded by
[ADR-0012](0012-informational-legends-and-team-scopes.md). The server allowlist,
project-wide assigned-work query, and review-visibility decisions remain active.

## Context

Repository and Board filter semantics were deferred until actual Azure DevOps
structure was understood. Read-only MCP metadata for Utilities showed many
repositories and two teams with different area-path scopes. Teams/Boards are
not equivalent to repositories.

The user then selected the initial repositories and clarified when collective
group approval satisfies a review request.

## Decision

Use an explicit repository allowlist. The initial workspace uses project Utilities
and repositories network-locator and Utilities. Do not auto-include newly
discovered repositories; preserve general support for multiple projects.

Query assigned work items across configured projects and all states, without a
team/board/area filter. Repository display controls affect PR sections only,
not work items or local todos.

Hide review requests after the user's own positive vote. Otherwise, retain an
unapproved individual request. For group-only requests, hide only once all
relevant reviewer groups have approved or approved with suggestions.

## Alternatives considered

- All active repositories by default: rejected in favor of explicit selection.
- Repository filters also hide work items: rejected; it would invent a one-repo
  ownership model absent from Azure DevOps.
- Team/area filtering in the MVP: not needed for the chosen project-wide view.
- Keep approved group requests until personal approval: not selected for
  group-only requests; individual outstanding requests remain independent.

## Consequences

- Server configuration must carry the repository allowlist; UI controls cannot
  expand integration permissions.
- Work-item queries do not depend on repository associations or team membership.
- Membership completeness and reviewer identity mapping are required for truthful
  group results. The observed team list is not sufficient evidence.
- Runtime Graph permissions and directory-backed membership remain G0 checks,
  not facts established by this metadata exploration.
- This resolves the filter questions deferred in
  [ADR-0008](0008-clickdummy-visual-baseline.md); it does not change that visual
  baseline or authorize implementation.

## Verification

[ADO-001](../requirements/azure-devops.md#ado-001--connection-scope),
[ADO-003](../requirements/azure-devops.md#ado-003--assigned-work-items),
[ADO-004](../requirements/azure-devops.md#ado-004--review-requests), and
[ADO-012](../requirements/azure-devops.md#ado-012--team-and-group-review-identity).

Use the [approval case table](../azure-devops-concept.md#required-acceptance-cases)
for regression tests, including mixed direct/group requests and incomplete
membership. No live PR content was read to establish those cases.
