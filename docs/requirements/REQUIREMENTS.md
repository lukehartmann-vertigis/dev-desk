# Requirements Baseline

Date: 2026-10-26

Version: **Baseline v1**  
Status: **Approved by the user; P0 complete on 2026-10-26.**

Approval covers MVP behavior and acceptance contracts, not completed
implementation or runtime verification. Following the partial G0 results, the
user explicitly authorized implementation and lifted the up-front G0 blocker in
[ADR-0011](../adr/0011-integrated-delivery-and-verification.md). The root app is
implemented; actual evidence and outstanding live checks are in the
[application report](../verification/application.md).
Deferred requirements do not gate the MVP.
User-approved frontend refinements on 2026-10-27 replace display filters with
informational repository/team-board legends and specify Enter submission,
independent content scrolling, and three counted ADO tabs with separate work/PR
color palettes. They refine ADO-003 and UX-001–003 without changing
the integration allowlist or assigned-work selection; see
[ADR-0012](../adr/0012-informational-legends-and-team-scopes.md).
This replaces the incomplete initial overview, whose MVP section was unfinished.
The supplied read-only attachment remains unchanged.

### Settings increment: approved and implemented

On 2026-10-28 the user confirmed persistent, application-wide Azure DevOps board
and repository selection, discovery across all PAT-accessible projects in one
organization, independently empty selections, and an empty start without legacy
scope import. The user then approved all accessible team-board candidates and
project grouping without a separate project picker. See
[settings requirements](settings.md) and
[ADR-0015](../adr/0015-persisted-azure-devops-settings.md).

The user requested documentation first, then explicitly authorized issue #1's
implementation. SET-001 through SET-011 now supersede the fixed initial scope
and add Settings navigation. Completed offline checks and remaining live PAT
acceptance are recorded in the application report, not inferred from approval.

## 1. Product goal

Provide a lightweight, locally hosted, single-user developer workspace. The
persistent todo list is the primary surface. Compact Azure DevOps views and an
integrated assistant reduce context switching throughout the working day.

This is not a daily planner: todos are neither assigned to days nor copied between
days. Timestamps support persistence and ordering, not a daily workflow.

## 2. Confirmed decisions

Confirmed directly during the planning discussion:

| Area | Decision |
| --- | --- |
| MVP | Todos, all three Azure DevOps views, and an integrated AI chat |
| Todo lifecycle | One persistent list without day assignment or rollover |
| External links | Todos can link to work items and pull requests in the MVP |
| AI todo writes | Create, edit, and complete directly; deletion requires confirmation |
| Azure DevOps | Azure DevOps Services, one organization and multiple projects; read-only MVP |
| Hosting | Local Docker Compose on Linux/WSL2; access through localhost only |
| Application | TypeScript strict and Next.js fullstack |
| Persistence | SQLite, Drizzle ORM, better-sqlite3, and versioned SQL migrations |
| AI integration | GitHub Copilot SDK; no additional LLM provider required in the MVP |
| Copilot access | Explicit server-side `COPILOT_GITHUB_TOKEN`; on-demand data transfer is approved |
| Chat storage | Durable local chat history, not browser-session-only storage |
| Runtime | Node.js 24 LTS |
| Frontend | Tailwind CSS and Framer Motion |
| Validation and logs | Zod and structured server-side logging |
| Tooling | npm, ESLint, Prettier, Vitest, and Playwright |
| Formatting | Real tabs, tab width 4, single quotes, semicolons |

The original multi-provider examples are superseded by the Copilot-only MVP.
Copilot subscription, account policies, model availability, and usage allowances
remain external prerequisites.

### Reviewed product refinements

The following details were subsequently confirmed, not inferred from the demo:

| Area | Confirmed behavior |
| --- | --- |
| Completed todos | Keep indefinitely in an initially collapsed section, latest completion first |
| Reopening | Keep the same todo and append it to the open list |
| Todo content | Title only, trimmed, 1–500 characters; no description in the MVP |
| Todo association | Zero or one reference: a work item or a PR |
| Deletion | Confirm manual and AI deletion; AI approval is exact, one-use, and expires after 5 minutes |
| AI write authorization | Automatic intent classification without a mode switch; clarify uncertain requests; residual misclassification risk is accepted |
| AI operations | Create, edit title/reference, complete, reopen, and reorder directly; deletion still requires approval |
| Conversation | One persistent conversation; confirmed clearing removes local app and SDK state |
| AI runs | One at a time, at most 120 seconds and 10 tool invocations; cancel further work on explicit cancel, disconnect, or tab closure |
| Work-item states | Include all assigned states, including completed states |
| Review visibility | Hide active PRs once the user approves or approves with suggestions; team/group review requests are included |
| Initial workspace | Empty Work Item Sources and Repositories, including upgrades; no legacy scope import |
| Repository policy | Explicit allowlist, not automatic inclusion of every repository; multiple projects remain supported |
| Work-item filtering | Assigned work items within selected readable team-area scopes; repositories are independent |
| Repository legends | Informational colored dots and matching row markers; no PR display filters |
| ADO navigation | Three tabs with cached-item count bubbles, including zero; local keyboard-accessible switching with one visible view |
| Context colors | Warm colors for work items/boards; separate cool colors for PRs/repositories, including tab accents and count bubbles |
| Board legends | PAT user's team-board area scopes; show all matches without filtering assigned work; unknown/stale mapping is explicit |
| Input shortcuts | Enter submits todo/chat once; Shift+Enter inserts a chat newline; IME and pending/cleanup guards remain effective |
| App scrolling | Independent central workspace scrollbar inside the app; separate chat scrollbar/drawer |
| Group approval | For group-only requests, hide once all relevant reviewer groups approve; an open personal request remains visible until the user approves |
| Sync | Initial background refresh, then 180 seconds after each cycle; configurable 30–3600 seconds; no overlapping cycles |
| Freshness | Mark stale after twice the configured interval or a failed latest attempt; preserve old data |
| Browser refresh | Read the local cache every 15 seconds while visible and on focus |
| Frontend reference | Use the clickdummy's layout and visual direction, not its demo storage or business rules |
| Navigation and chat | One dashboard, no separate Daily Todos page; chat uses a drawer on narrow screens |
| UI language | English; chat accepts natural language such as English or German |
| Time | Store timestamps in UTC; display in the browser's local timezone; no date-based business rules |
| Retention | No automatic deletion of todos or chat; explicit confirmed deletion/clearing only |
| Configuration failures | Isolate invalid/missing integration configuration; show its state while local todos remain usable |
| Core storage failures | Invalid/unusable database or failed migration prevents normal writable operation |
| Mutation contracts | Detect stale writes, make retries safe, share UI/AI validation, and acknowledge success only after commit |
| UI quality | Dark-first, keyboard accessible, reduced-motion aware, usable at 375/768/1440px |
| Operational quality | Localhost-only, server-side secrets, safe rendering/logging, persistent volume, documented backup/restore, and release checks |
| Performance | Benchmarks, numeric latency targets, and reference-hardware measurement are deferred; not MVP gates |

Automatic AI intent classification is not a deterministic security guarantee.
Tool boundaries, deletion approval, and the Azure DevOps write prohibition remain
server-enforced regardless of classification. See
[ADR-0007](../adr/0007-automatic-ai-intent.md).

## 3. MVP boundaries

### Included

- Persistent todo creation, editing, completion, reopening, deletion, and ordering.
- Preserved completed todos without daily grouping.
- Optional work-item or PR association on individual todos.
- Assigned work items, requested reviews, and the user's open pull requests.
- Direct and team/group reviewer requests, with membership-resolution details
  still subject to technical verification.
- Periodic server-side synchronization, manual refresh, and persistent local cache.
- Copilot chat with on-demand reads and bounded local todo tools.
- Persistent chat history, restart recovery, and user-initiated chat clearing.
- Dark-first, keyboard-accessible, responsive single-page dashboard.
- Local operation without application login; secrets remain server-side.

Repository selection, dashboard filter semantics, and group-vote behavior have
been confirmed after scoped metadata exploration. See the
[Azure DevOps concept](../azure-devops-concept.md). Complete group-membership
resolution remains a technical gate, not an unresolved product policy.

### Explicitly excluded

- Day assignment, rollover jobs, daily snapshots, calendars, and recurring todos.
- Todo descriptions/notes and multiple references on one todo.
- Sprint/iteration filtering.
- Team/board/area-path filtering of work items and repository-derived work-item filtering.
- Build/pipeline status and merge-conflict detection.
- Writes to Azure DevOps, including comments, votes, and work-item updates.
- Multiple organizations, Azure DevOps Server, and repository-management workflows.
- Multiple users, LAN exposure, public hosting, or application authentication.
- Other LLM providers, BYOK, vector storage, RAG, autonomous agents, or MCP servers.
- Shell access, source-code editing, repository checkout, or arbitrary browsing by AI.
- Multiple chat threads, search across chats, notifications, and automatic summaries.
- Mobile native apps, offline installation/PWA, and cloud synchronization.
- Mandatory performance benchmarks, latency percentiles, and reference-hardware
  certification.

“Offline” below means unavailable external services while the local server is
running. It does not promise a usable UI when the local application is stopped.

## 4. Requirement conventions

- IDs are stable and unique. Split requirements receive new IDs; retired IDs are
  not reused.
- Each active numbered requirement states one independently testable behavior, followed
  by acceptance criteria.
- `MUST` in an active requirement is required for baseline v1 MVP acceptance.
- All active requirement behavior and acceptance contracts are approved. Specific
  adapter algorithms, endpoint/config encodings, and package versions still need
  the technical verification described in G0.
- A requirement explicitly marked Deferred is retained for traceability, is not
  an active MVP obligation, and requires a new decision before reactivation.
- Accepted ADRs record confirmed choices. Proposed ADRs are not implementation
  authorization.
- Acceptance scenarios are specifications, not evidence of tests already passing.
- Separately labelled proposed increments do not change baseline v1 acceptance
  or authorize implementation. Their `MUST` statements are draft acceptance
  contracts until reviewed for that increment.

## 5. Requirement index

| IDs | Specification |
| --- | --- |
| TODO-001 through TODO-011 | [Todo management](todos.md) |
| ADO-001 through ADO-012 | [Azure DevOps integration](azure-devops.md) |
| AI-001 through AI-013 | [Assistant](assistant.md) |
| UX-001 through UX-008 | [Experience](experience-and-operations.md#experience) |
| OPS-001 through OPS-010 | [Operations and quality](experience-and-operations.md#operations-and-quality); OPS-006 is deferred |
| SET-001 through SET-011 | [Azure DevOps settings](settings.md); approved and implemented increment |

## 6. Approved defaults and deferred work

| Topic | Approved rule |
| --- | --- |
| UI language | English; chat accepts the user's natural language |
| Time | Store UTC timestamps; display in the browser's local timezone; no date-based business logic |
| Failures | Azure DevOps/Copilot outages and invalid integration configuration do not disable local todos; states/errors are explicit |
| Performance | [OPS-006](experience-and-operations.md#ops-006--local-performance) is deferred; no benchmark or numeric threshold is required for MVP acceptance |
| Persistence | No automatic retention expiry for todos or chat; confirmed manual deletion/clearing remains available |

Concurrency/retry contracts, UI quality, and operational acceptance criteria were
also approved. This is specification approval, not passing test evidence. The
frontend follows the accepted visual direction; browser and visual evidence
are recorded separately in the application report.

## 7. Open gates

Resolved/deferred IDs are retained for traceability. ADR-0011 removes G0 completion
as an implementation prerequisite, not the need for honest acceptance evidence.
No performance reference environment is required.

| ID | Decision or evidence needed | Resolution |
| --- | --- | --- |
| OPEN-01 | Approve defaults and acceptance criteria | Resolved: user approved baseline v1 and completed P0 on 2026-10-26 |
| OPEN-02 | Choose exact compatible Next.js/React/Tailwind/Motion/SDK/native-module versions | Resolved for the recorded Linux x86_64 G0 fixture and lockfile; repeat on upgrades |
| OPEN-03 | Demonstrate one persistent polling coordinator in the actual Next.js production container | Resolved for the tested single-replica Node hosting mode; ADR-0004 accepted |
| OPEN-04 | Demonstrate Copilot tool isolation, authentication, restart/resume, and complete local session cleanup | Offline native policy/session and fake-provider orchestration checks exist; real authentication, classification, and conversation/container recovery remain account-specific acceptance |
| OPEN-05 | Verify actual Azure DevOps projects, identity, PAT read permissions, custom fields, and repository access | Real adapter implemented and contract-tested offline; actual app PAT remains account-specific acceptance |
| OPEN-06 | Record performance reference hardware and benchmark fixture | Deferred with OPS-006 by user decision; not a P0, G0, or MVP release gate |
| OPEN-07 | Repository selection and project/board/repo filter policy | Superseded by SET/ADR-0015: persisted readable team-area and repository selection; projects only group choices; local chips remain presentation |
| OPEN-08 | Verify complete group membership, nested/directory-group limitations, identity mapping, and read permissions | Product semantics and offline nested/cycle handling covered; actual account Graph visibility and reviewer parity remain live acceptance |
| OPEN-09 | Review the settings increment's detailed contracts and authorize implementation | Resolved on 2026-10-28: issue #1 implementation explicitly authorized; offline delivery evidence is in the application report; live catalog/PAT acceptance remains separate |

No secrets, real work-item content, or chat transcripts belong in this
documentation. Integration experiments must use approved test data.
After authentication, scoped MCP metadata reads verified repository and team
structure for Utilities. No work-item bodies, PR discussions, source files, or
secrets were retrieved. These observations do not prove the future app PAT's
permissions or complete group traversal. The clickdummy's sample names remain
illustrative, not configuration.

## 8. Changes from the initial overview

| Initial statement | Current disposition |
| --- | --- |
| Daily list with automatic carry-over | Replaced by a persistent list with no daily behavior |
| History of completed daily todos | Preserved completed records, without day-based grouping |
| Configurable OpenAI/Ollama provider | Copilot SDK is the only required integration; model remains configurable |
| Optional sprint/build/conflict features | Explicitly deferred |
| Sidebar or panel | Confirmed desktop side panel and responsive mobile drawer; clickdummy is the visual baseline |
| SQLite persists everything | Application records use SQLite; Copilot session state also requires persistent storage |
| Unfinished MVP scope | Replaced by the included/excluded scope above |

See the [architecture](../architecture.md), [ADR register](../adr/README.md), and
[implementation plan](../implementation-plan.md) for the corresponding decisions
and verification gates.
