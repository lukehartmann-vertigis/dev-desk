# ADR-0015: Persisted Azure DevOps Source Settings

Date: 2026-10-28

Status: Accepted; implementation authorized and delivered on 2026-10-28.
Offline evidence and remaining live-account limits are recorded separately.

## Context

Before this increment, the dashboard derived project/repository scope from server environment
configuration. Team-board metadata described the PAT user's teams, and local
chips select which already-cached group is visible. Neither the chips nor
informational legends are persistent application-scope configuration.

Before adding ticket planning/coding capabilities, the user requests a settings
page listing Azure DevOps boards and repositories with persistent selection.
Clarification confirmed:
- Selection governs the whole application, not just dashboard presentation:
  synchronization, current cached reads, and new assistant retrievals.
- Candidates come from all accessible projects in the configured organization.
- Work Item Sources offer all readable team-board scopes, not only the user's
  own teams. Repositories are selected independently.
- Projects such as Utilities group the source lists; there is no separate
  project picker. Effective projects follow the selected sources.
- Either list may be empty; empty never means all.
- Introduction starts empty, including existing installations. Do not migrate
  the legacy environment-selected scope.
- Requirements and this ADR precede separately authorized implementation.

The user approved this product concept on 2026-10-28 after clarifying accessible
teams and project grouping. After documentation and an implementation plan, the
user explicitly authorized implementation of issue #1. The
[settings specification](../requirements/settings.md) defines acceptance; the
[application report](../verification/application.md) separates offline evidence
from unperformed live checks.

## Decision

### 1. Keep the existing application boundary

Add a dedicated Settings page to the existing Next.js application, with one
Azure DevOps section containing searchable, project-grouped Work Item Sources
(team-board scopes) and Repositories lists. Checkbox edits are drafts; Save
commits both lists and Cancel discards edits.

Use the existing server, SQLite/Drizzle storage, polling coordinator, and
same-origin HTTP boundary. Do not add a service, queue, global state framework,
MCP server, or generic preferences platform.

Organization, PAT, sync interval, and optional identity assertion remain
server-side connection configuration. This increment does not implement a
credential editor, organization switcher, or coding runner.

### 2. Separate discovery from enabled scope

Discover projects and their readable teams/repositories across the configured
organization using the app's PAT. Do not restrict candidates to environment
project names or `$mine=true` teams.

Discovery is a metadata operation, not permission to synchronize every source.
It must handle endpoint pagination and expose partial/failed discovery. Catalog
reads do not fetch candidate work-item bodies, PR discussions, or source code.
Discovery stays usable with no enabled sources.

Validate newly selected identities and actual source ownership/access on the
server. Retain previously selected unavailable identities and last-known labels
until explicitly removed; incomplete catalogs cannot rewrite selection.

### 3. Persist one explicit organization-scoped selection

Use an organization-scoped settings record in the existing SQLite database,
with a revision and selected board/repository identities. Use stable project,
team, and repository IDs; names are display metadata. Follow the existing
Drizzle/versioned-migration and backup conventions.

Save is one short local transaction after any necessary upstream validation.
Detect stale revisions rather than overwriting another tab's changes. Failed
validation/persistence leaves the previous effective selection intact.

An absent record and an explicitly saved empty selection both enable no
sources. An organization change cannot inherit another organization's
selection. A PAT change for the same organization rechecks actual access
without silently deleting the stored selection.

AZURE_DEVOPS_PROJECTS and AZURE_DEVOPS_REPOSITORY_IDS are no longer scope sources;
report legacy values as deprecated.
There is no merge, environment override, default repository seed, or first-run
import. Existing caches remain subject to the new initially empty scope.

### 4. Share one effective scope across consumers

Resolve the committed selection through shared server-side scope logic, used by
dashboard/cache readers, synchronization, assistant tools, and new/changed todo
reference validation. A browser filter or model prompt cannot enforce this.

Boards remain team-area scopes: assigned-to-PAT-user work items matching the
union of selected project/team area rules, with existing includeChildren and
case-insensitive path-boundary semantics. This is not exact Kanban/backlog
visibility. Preserve work-item types/states and overlapping matches. An
unresolved scope cannot fall back to all assigned project work.

Repositories govern own/review PR datasets independently of selected boards.
Preserve personal/group vote rules; review-group traversal is not restricted
to selected board teams. Project scope is derived from the corresponding
selected sources, not a third user-maintained project allowlist.

Only a minimal candidate field read within a selected board's project may
precede work-item area validation. Do not expose a rejected candidate or fetch
its discussions. Existing unchanged todo references remain stored and do not
block unrelated local todo operations.

The assistant cannot change settings or use discovery to expand its scope.
Old messages/model context are historical, not authorization for new retrieval.
Changing selection is not a promise to erase already supplied provider context.

### 5. Apply revisions live without widening on failure

Committed settings become effective on server reads immediately, without a
restart. Notify/update the saving view; other views use the existing polling
and focus refresh.

Coordinate refresh through the existing single sync lifecycle. New selections
can use eligible last-good cache data with freshness while refreshing. Recheck
the current revision before exposing in-flight sync/detail results so an older
operation cannot restore removed sources.

Do not treat retained snapshots as authority. Discovery failures retain saved
settings; selected-source failures retain eligible last-good data with explicit
errors. Neither failure enables all sources. Removed sources stop contributing
current data even if their snapshots remain on disk.

### 6. Preserve local UX and user records

Empty boards and empty repositories independently produce explicit empty
states with a link to Settings, not integration errors. Upgrades must explain
why legacy dashboard data is no longer current until sources are selected.

Keep the existing single-select chips as local presentation over the enabled
dataset. Tab totals cover all enabled rows, not just the active chip; overlapping
board counts may still exceed the deduplicated dataset total.

Selection changes do not delete todos, references, chat, or SDK history.
Historical links remain historical; new reads must pass current scope checks.
Do not automatically purge caches or silently rewrite the conversation.

## Supersession boundary

This delivered increment supersedes:
- [ADR-0009](0009-ado-scope-and-review-visibility.md): environment-owned initial
  project/repository choices and project-wide assigned-work scope, not explicit
  selection or PR review semantics.
- [ADR-0012](0012-informational-legends-and-team-scopes.md): own-teams-only
  discovery and board annotation without application-scope filtering, not the
  team-area interpretation, overlap rules, palettes, or freshness requirements.
- [ADR-0014](0014-local-scope-chips-and-tool-outcomes.md): complete configured
  source dataset becomes complete enabled source dataset. Chips themselves
  remain local, single-select presentation; tool disclosure behavior is unchanged.

Accepted historical ADRs are not rewritten. Current application documentation
describes the persisted selection rather than the superseded defaults.

## Alternatives

- Browser/localStorage-only preferences: fail durable server/assistant scope.
- Dashboard-only filters: explicitly rejected by the user.
- Discovery limited to environment projects or own teams: conflicts with
  organization-wide accessible-source selection.
- Merge environment allowlists with database settings: creates competing
  authorities and makes empty/deselected scope ambiguous.
- Import legacy defaults or preserve the old scope until first Save: explicitly
  rejected in favor of an empty start.
- Select all discovered sources or interpret empty as all: violates explicit
  selection and broadens background/model data access.
- Exact board/backlog reconstruction or a general settings platform: unnecessary
  for the team-area and repository selection increment.

## Consequences

- Initial setup and upgrade require explicit source selection. No legacy data is
  deleted, but old cache rows are hidden from current integration views/tools.
- Catalog access is intentionally broader than enabled content access; required
  project/team/repository read permissions and paging must be verified with the
  actual app PAT.
- Scope can change while async work runs, so revision checks and consistent
  server-side readers are necessary. This is more than adding checkbox state.
- The settings page introduces navigation without changing todo/chat semantics.
- No new runtime dependency or infrastructure is required. Shared Zod contracts,
  one SQLite settings table, and the existing protected catch-all API implement
  the boundary.

## Verification

Use [SET-001 through SET-011](../requirements/settings.md) and their verification
plan for domain/storage, adapter, scope enforcement, async lifecycle, upgrade,
and browser scenarios. Keep default tests offline and live checks explicitly
opt-in and read-only.

See the [application report](../verification/application.md) for completed
offline/migration/browser checks and the remaining live discovery limitation.
Track delivery in [GitHub issue #1](https://github.com/lukehartmann-vertigis/dev-desk/issues/1).
