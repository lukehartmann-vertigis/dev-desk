# Azure DevOps Settings

Date: 2026-10-28

Status: **Product concept approved on 2026-10-28; detailed acceptance contracts
proposed for review; not implemented.**

The user confirmed the following product constraints:
- Provide a settings page for selecting Azure DevOps boards and repositories.
- Persist the selection across application/container restarts.
- Apply the selection application-wide, including synchronization, dashboard
  data, and new assistant retrievals, not just local display filtering.
- Discover candidates across all PAT-accessible projects in the configured
  organization, not only environment-configured projects.
- Work Item Sources includes all readable team-board scopes, not just the user's
  own teams. Projects group the two source lists without a separate project
  picker; effective projects follow the selected boards and repositories.
- Allow either selection to be empty: no boards means no Azure work items;
  no repositories means no PR datasets.
- Start empty on introduction, including existing installations. Do not import
  the legacy environment-configured scope.
- Document requirements and an ADR first; implementation is not authorized by
  this documentation task.

The user approved the product concept after clarifying accessible teams and
project grouping. The detailed contracts below remain proposed for review.
`MUST` describes intended acceptance of this increment, not current application
behavior, implementation authorization, or passing tests.
See [ADR-0015](../adr/0015-persisted-azure-devops-settings.md).
Implementation tracking: [GitHub issue #1](https://github.com/lukehartmann-vertigis/dev-desk/issues/1).

## Relationship to baseline v1

The [baseline](REQUIREMENTS.md) and its implemented behavior remain documented
separately. When approved and delivered, this increment replaces:
- ADO-001's environment-owned project/repository allowlist, nonempty constraint,
  and initial Utilities/repository defaults.
- ADO-003's project-wide assigned-work inclusion and own-teams-only discovery.
  Assigned-user, type, state, and team-area matching semantics remain.
- The source of scope validation in ADO-011 and AI-004/AI-009, not their read-only
  access or tool restrictions.
- UX-001's dashboard-only navigation constraint and the scope underlying its
  legends, groups, and totals. Local chip selection remains presentation-only.
- OPS-003's environment-owned source selection. Credentials and connection
  configuration remain server-side.

PR approval/group rules, todo lifecycle, chat retention and capability limits,
single-user hosting, and existing accessibility/failure conventions are unchanged.

## SET-001 - Settings navigation

The application MUST provide a dedicated settings page for Azure DevOps sources.

Acceptance:
- Settings is reachable from the dashboard, with a way back to the workspace.
- Separate Work Item Sources and Repositories sections show named checkbox
  choices grouped by project. Work Item Sources identifies team-board area
  scopes. Each section supports searching by project or source name.
- There is no separate project selection; sources can be chosen from different
  accessible projects in the same organization.
- Search changes the visible candidate list, not the saved or draft selection.
  Selected entries remain inspectable even when outside the current search.
- Loading, no candidates, no selection, partial discovery, and failed discovery
  have distinct English text.
- Navigation does not delete todos or clear the conversation. Controls follow
  UX-002/UX-003 at 375px, 768px, and 1440px, including keyboard use and visible
  focus.

## SET-002 - Organization-wide candidate discovery

The server MUST discover selectable sources throughout the configured
organization within the authenticated PAT's actual access.

Acceptance:
- Discover accessible projects and their readable teams and repositories.
  Team candidates are not restricted to teams containing the PAT user.
- "Boards" means team-board area scopes, not individual Kanban boards, columns,
  backlog levels, iterations, or an exact recreation of Azure Boards visibility.
  The UI explains this distinction.
- Handle endpoint pagination; a truncated, denied, or failed result is explicitly
  incomplete, not a successful empty or complete organization catalog.
- Catalog discovery reads source metadata only. It does not retrieve candidate
  work-item bodies, PR discussions, or repository source code.
- Discovery does not select newly found sources or expand synchronization scope.
- The browser receives safe catalog metadata, never the PAT. Client-supplied
  organization/project names cannot redirect requests outside the configured
  organization.

## SET-003 - Explicit selection and save

The application MUST commit a user's complete board/repository selection only
through an explicit save.

Acceptance:
- Checkbox edits remain a local draft until Save. Cancel restores the saved
  selection without changing synchronization or assistant access.
- Save commits both lists atomically. An empty list is valid independently of
  the other list; there is no implicit Select all behavior.
- A failed save retains draft edits, reports an actionable error, and leaves
  the last committed settings effective.
- A stale settings revision from another tab produces a conflict, not a silent
  overwrite. Pending-save controls prevent duplicate submission.
- Filtering or partially loading the catalog cannot silently remove selections.
- The server validates newly added source identities, accessibility, and actual
  organization/project ownership. Display names from the browser are not proof.
- Previously selected but now unavailable entries stay visible with their
  last-known labels and an unavailable state until explicitly deselected.
  Retaining them does not establish access or authorize broader reads.

## SET-004 - Durable organization-scoped storage

Committed settings MUST persist in the existing SQLite-backed local storage.

Acceptance:
- Reload, orderly restart, and container recreation with the persistent volume
  retain exactly the saved selections, including explicit empty lists.
- Store stable organization/project/team/repository identities and a settings
  revision. Display names are metadata, not selection keys.
- Organization identity is normalized consistently. Changing the configured
  organization does not reuse another organization's sources or caches.
- A new PAT for the same organization does not silently clear selections;
  lost permissions are reported when the sources are checked.
- Settings participate in the existing persistence/migration/backup boundary.
  A storage error is not converted into a successful empty-settings response.

## SET-005 - Selected board work-item scope

The application MUST limit current work-item data to the PAT user's assigned
items matching at least one selected team-board area scope.

Acceptance:
- Board matching uses the source's project identity and its System.AreaPath
  values, with case-insensitive, path-boundary-aware includeChildren semantics.
- Multiple selected boards form a union. Overlapping matches appear once in the
  dataset total and in every matching local board group.
- Preserve all work-item types and states, including terminal states. Selecting
  a board does not include work assigned only to somebody else.
- Repository selection neither grants nor removes work-item scope.
- Selecting a team does not require the PAT user to be a member of that team,
  but actual access and readable team-area metadata are required.
- Missing/unresolved metadata does not prove a match. Last-good positive matches
  may remain available with explicit staleness; otherwise show a scope-resolution
  error rather than falling back to project-wide assigned work.
- Unselected/no-team/unknown items are not a route around the selected scope.
  Existing local grouping behavior applies only to the eligible dataset.

## SET-006 - Selected repository PR scope

The application MUST limit both PR datasets to explicitly selected repositories.

Acceptance:
- Only selected repositories contribute own active PRs and active review
  requests, including their tab totals, legends, and grouping chips.
- Preserve existing direct/group review and approval visibility rules.
  Group-membership resolution is not limited to selected board teams.
- Board selection neither grants nor removes PR scope.
- Local chip changes neither alter the saved selection nor trigger new upstream
  reads. Newly discovered repositories remain unselected.

## SET-007 - Shared server-side scope enforcement

All current Azure DevOps reads and new reference associations MUST use the same
committed settings, independently of UI controls and model instructions.

Acceptance:
- Apply current scope to dashboard/cache reads, synchronization results exposed
  to consumers, assistant dashboard/detail/discussion tools, and new or changed
  todo references, including manually pasted links.
- Retained cache rows and remembered IDs cannot authorize unselected sources.
  Handlers recheck effective scope on each operation, including resumed chats.
- A work-item identity in a selected board's project may require a minimal
  field read to establish area membership. Validate membership before exposing
  the item to the browser/model or fetching its discussions; reject items from
  projects with no selected boards without fetching their details.
- Existing todos retain their references. Editing their title, reordering,
  completing, reopening, or deleting them remains possible without changing or
  reauthorizing an unchanged out-of-scope reference.
- The assistant cannot select sources, save settings, or invoke organization-wide
  discovery to expand its own context.
- Existing chat/SDK history is historical, not evidence that an object is still
  selected. Scope changes do not promise to erase already supplied model context
  or provider-side records; new retrievals must obey current settings.

## SET-008 - Live application and in-flight work

A successful save MUST change effective source scope without an application or
container restart.

Acceptance:
- The saving view updates from the committed revision. Other visible tabs adopt
  it within the existing local polling interval, or on focus.
- Removed sources stop contributing current data immediately on server reads,
  even if their cache rows remain stored.
- Newly selected sources use eligible last-good cache data with freshness, when
  available, and request a refresh without overlapping sync cycles.
- A save during synchronization or an assistant detail read cannot publish or
  return superseded results as currently selected data. Recheck the revision
  before exposing results; schedule any necessary follow-up sync for the latest
  revision.
- Already dispatched upstream requests cannot be retroactively unsent. Their
  completion cannot restore removed sources or overwrite newer settings.

## SET-009 - Discovery and source failures

Discovery or source failures MUST preserve explicit selection and never broaden
effective scope.

Acceptance:
- Failure of one project's catalog or one selected source leaves independent
  successful results usable, with partial/failure state identified.
- Keep saved identities and last-good labels when a source is renamed,
  inaccessible, disabled, or absent from an incomplete catalog.
- Failed discovery does not clear settings, enable all accessible sources, or
  present an empty selection as if it were the saved state.
- An unavailable selected source has an explicit error. Last-good eligible data
  follows the existing cache/freshness rules; an unresolved board scope does not
  grant project-wide access.
- Allow removal of saved selections without successful catalog discovery.
  Adding a source requires successful validation, not a fabricated catalog row.
- Local todos, stored chat, and independently configured Copilot remain usable
  when Azure DevOps discovery is unavailable.

## SET-010 - Empty initial scope and rollout

New and upgraded installations MUST start with empty selections unless settings
have already been explicitly saved for the configured organization.

Acceptance:
- Do not seed/import the current Utilities project, default repositories, own
  teams, or legacy environment selections.
- AZURE_DEVOPS_PROJECTS and AZURE_DEVOPS_REPOSITORY_IDS no longer determine
  effective scope after this increment is delivered. Existing values are
  reported as deprecated rather than silently restoring the old scope.
- No boards means no current work items. No repositories means neither PR
  dataset has current rows. Both may be empty simultaneously.
- A valid connection with no sources selected is an intentional empty state,
  not a configuration error, failed sync, or shorthand for all sources.
- Explain the empty initial scope and link to Settings, including for users
  upgrading with populated legacy caches. Discovery remains available with a
  valid PAT even when nothing is selected.
- Once settings exist, restart preserves the saved selection; it does not reset
  the user's choices to empty.

## SET-011 - Retention and unchanged capabilities

Changing source selection MUST NOT delete user records or grant new agent
capabilities.

Acceptance:
- Deselecting sources or starting empty does not delete todos, their references,
  stored chat, or existing SDK history.
- Previously cached data may be retained, but is not exposed as current
  unselected dashboard/tool data. Reselection can reuse it only with its actual
  freshness and current scope/access checks.
- Existing historical messages and links are not rewritten to imply current
  availability. A new detail/verification request still checks current scope.
- PAT and organization remain server-side environment configuration.
  Settings do not store/edit tokens, switch organizations, or borrow host login.
- Azure DevOps access stays read-only. No cloning, filesystem/shell access,
  coding runner, PR creation, or ticket implementation is introduced.

## Verification plan

Acceptance scenarios are planned checks, not completed test evidence.

- Domain/storage: stable identities, organization separation, empty state,
  atomic save, conflicts, failed writes, and persistence across restart.
- Adapter: organization/project/team/repository paging, non-member readable
  teams, partial catalogs, unavailable selected entries, metadata-only discovery,
  and actual ownership/access validation.
- Scope: overlapping board areas, descendant boundaries, missing/stale metadata,
  independent board/repository choices, unchanged review votes/groups, and
  rejection of out-of-scope cache/detail/reference reads.
- Lifecycle: save during sync/detail retrieval, rapid revision changes, latest
  scope adoption, no overlapping cycles, and no legacy environment fallback.
- Browser: navigation, search without lost selections, Save/Cancel/conflict
  feedback, empty/unavailable states, multiple tabs, keyboard use, responsive
  widths, and retained todos/chat after deselection.
- Live read-only acceptance: prove accessible project/team/repository discovery
  and required PAT permissions with approved metadata only. Never infer those
  permissions from the current app configuration or MCP credentials.

## Out of scope

No general preferences framework, token editor, multi-organization UI, per-user
accounts, automatic source selection, persisted local chip preferences, exact
Azure Boards backlog reconstruction, or coding-agent execution. Detailed HTTP
schemas, endpoint paging implementation, and live-account evidence belong to
implementation/verification after review.
