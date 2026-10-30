# Architecture

Status: implemented for [baseline v1](requirements/REQUIREMENTS.md), with delivery
authorized by [ADR-0011](adr/0011-integrated-delivery-and-verification.md).
The [application report](verification/application.md) separates verified local
behavior from outstanding account-specific live acceptance. The earlier
[G0 report](verification/g0.md) remains historical compatibility evidence.

Implemented increment: [Azure DevOps settings](requirements/settings.md) and
[ADR-0015](adr/0015-persisted-azure-devops-settings.md) define persistent,
application-wide source selection with organization-wide discovery and an empty
initial scope, replacing the former environment-owned allowlists.

## 1. Shape and boundaries

A modular Next.js monolith runs on the Node.js runtime in one application
container. The Copilot SDK manages a child runtime process; “monolith” does not
mean literally one OS process.

```text
Browser: React + Tailwind CSS + Framer Motion
    |
    | same-origin HTTP; streamed assistant events
    v
Next.js App Router
    | server rendering / route handlers
    v
Application services
    +-- Todos --------> Drizzle / better-sqlite3 ----> SQLite
    +-- Dashboard ----> persistent Azure DevOps cache --^
    +-- Sync ---------> scoped Azure DevOps REST client
    +-- Chat ---------> Copilot SDK ----> managed runtime ----> Copilot
                              |
                              +-- allowlisted callbacks --> application services

Persistent local volume
    +-- dashboard.db (+ SQLite WAL/SHM files when present)
    +-- copilot/ (SDK-owned state)
    +-- runtime-work/ (dedicated non-repository working directory)
```

No Fastify, separate SPA server, Redis, job queue, vector database, provider
framework, or general-purpose dependency-injection container is needed.
Repository source files are not mounted into the production container.
The [frontend concept](frontend-concept.md) translates the user-provided
clickdummy into the accepted visual hierarchy without copying its demo logic.

## 2. Technology choices

| Concern | Choice | Constraint |
| --- | --- | --- |
| Language | TypeScript strict | Validate untrusted input at runtime too |
| Runtime | Node.js 24 LTS | Native module and SDK compatibility gate |
| Fullstack/UI | Next.js App Router + compatible React | Node runtime, not Edge or serverless |
| Styling | Tailwind CSS | Shared tokens; no second styling framework |
| Animation | Framer Motion | Small client boundaries; respect reduced motion |
| Todo sorting | dnd-kit core/sortable/utilities | Explicit handles, pointer/touch/keyboard sensors; shared server mutation |
| Assistant Markdown | react-markdown + remark-gfm | No raw HTML/images; exact known HTTPS ADO links only |
| Persistence | SQLite + better-sqlite3 | Short synchronous transactions, single app replica |
| Schema/migrations | Drizzle ORM + Drizzle Kit | Reviewed, committed SQL migrations |
| Runtime validation | Zod | HTTP, configuration, tool input, and upstream boundaries |
| AI | `@github/copilot-sdk` | One managed runtime, one active conversation |
| Logs | Structured JSON through a small server logger | No payload/secret logging by default |
| Tooling | npm + ESLint + Prettier | Lockfile; real tabs, width 4 |
| Tests | Vitest + Playwright | Mocked integrations plus opt-in real smoke tests |
| Packaging | Docker Compose | Linux/WSL2, loopback-only port |

The historical [G0 checks](verification/g0.md) verified exact versions,
Tailwind integration, and Motion's `motion/react-client` entry point together.
The disposable fixture has since been removed.
The root [package and lockfile](../package.json) now pin the same verified
dependency baseline for the real application.

## 3. Module ownership

Modules follow domain and lifecycle boundaries. Compatibility facades preserve
existing application import paths while implementations remain cohesive:

Overview (including its loading/error state) and Settings use the same
`AppShell` component for brand, navigation, active-page indication, and responsive
layout. Dashboard legends and chat are optional page-owned slots; Settings has
no empty chat column. Controllers remain route-owned, so leaving Overview still
cancels active chat. No shared state manager, extra polling, or provider reads
are introduced by navigation.

```text
src/
    app/                  Next.js pages, route handlers, layouts
    components/
        app-shell.tsx     Shared Overview/Settings navigation and responsive page frame
        dashboard.tsx     Workspace composition
        settings.tsx      Project-grouped source drafts, discovery, explicit Save/Cancel
        dashboard/
            use-dashboard.ts       Polling, controlled forms, retries, chat lifecycle
            api.ts                 Validated browser HTTP boundary
            todo-list.tsx          Todo input, rows, ordering, reduced motion
            chat-panel.tsx         Transcript, composer, safe source links
            message-content.tsx    Safe assistant GFM and literal user messages
            tool-outcome.tsx       Compact native tool disclosures and honest outcome summaries
            devops-tabs.tsx        Counted tabs, cached work/PR views, metadata
            devops-groups.ts       Pure local team/repository grouping and row markers
            scope-legend.tsx       Deterministic scope colors and sidebar legends
            modal.tsx              Native dialog focus/Escape behavior
            dashboard-dialogs.tsx  Edit/deletion/clear confirmations
    lib/
        contracts.ts      Stable browser-safe domain facade
        contracts/        References, todos, ADO, chat, dashboard schemas/types
        format.ts         Locale-aware timestamp presentation
    server/
        config.ts         Independently validated core/ADO/Copilot settings
        schema.ts         Drizzle tables
        store.ts          SQLite ownership and runtime migrations
        todos.ts          Shared transactional mutations, receipts, approvals
        azure.ts          Identity, scoped sync/cache, reference reads/validation
        azure-discovery.ts Metadata-only organization catalog and ownership validation
        settings.ts       Organization-scoped selection and atomic revision checks
        azure-http.ts     Authenticated REST transport, timeouts, bounded retries
        chat.ts           Managed SDK, tools, transcript, cancellation/cleanup
        chat-policy.ts    SDK isolation policy and tool/classification schemas
        chat-response.ts  NDJSON transport, heartbeat, disconnect propagation
        runtime.ts        Process-owned resources and awaited shutdown
        http.ts           Localhost boundary and safe HTTP errors
        errors.ts         Trusted cross-entry errors and redacted JSON logs
        *.test.ts         Domain, adapter, orchestration, and native policy tests
drizzle/                  Versioned SQL migrations
tests/
    e2e/                  Real production browser acceptance
```

Rules:
- Route handlers validate requests and translate application outcomes into HTTP.
  They do not own domain rules.
- Todo UI and AI tools use the same todo service.
- Server modules are explicitly server-only; client imports cannot reach
  credentials, database code, or the SDK.
- Server Components read application services directly, not through self-HTTP.
- No global client store. Controlled view state stays in React; transient tab,
  drag, and focus state belongs to the relevant presentation component.
- The dashboard controller co-owns pending-write locks, retry receipts, polling
  and stream cancellation. Presentation components cannot bypass these guards.
- Contract and SDK-policy re-exports retain their existing import paths. Extraction
  does not alter wire shapes, database migrations, or the configured scope.
- External APIs are accessed only by the server; SDK tools cannot bypass scoped
  application clients.

## 4. Persistence model

Implemented tables are defined in [schema.ts](../src/server/schema.ts).

| Record | Key fields / purpose |
| --- | --- |
| Todo | UUID, title, status, position, revision, created/updated/completed timestamps, optional typed external reference |
| Metadata | List revision, single SDK conversation/classifier IDs and state paths, cleanup flag |
| Snapshot | Organization + dataset + project/repository key, normalized JSON, last success, latest failure |
| Azure settings | Normalized organization, revision, selected team/project and repository/project UUIDs with last-known labels |
| Message | UUID, run ID, timestamp, role, content, complete/interrupted/failed state |
| Assistant run | Request UUID, creation timestamp, lifecycle state |
| Tool outcome | Structured tool-role message; durable mutation identity derives from run and SDK tool-call IDs |
| Deletion approval | Opaque ID, run/todo/revision, display snapshot, expiry, consumption state |
| Mutation receipt | Operation ID, payload hash, committed outcome for retry safety |

### Todo rules

- `open` implies no completion timestamp; `completed` requires one.
- No due date, assigned date, daily snapshot, or rollover table.
- Store persisted instants in UTC; render user-facing timestamps in the browser's
  local timezone without date-based mutations.
- Open positions are normalized within one short transaction.
- Membership changes (create, complete, reopen, delete) update the list revision
  as well as the affected todo revision.
- A PR reference includes organization, project, repository, and PR ID; a work-item
  reference includes organization, project, and work-item ID.
- Store typed identity rather than trusting an arbitrary user/model URL. Build
  safe external URLs from that identity.

### Storage lifecycle

- Enable foreign keys, WAL, a bounded busy timeout, and a durability setting
  appropriate for acknowledged local writes; verify actual behavior in tests.
- A mutation and its retry receipt commit atomically. Reuse with a different
  payload is a conflict.
- AI operation IDs are derived from persisted app run identity and SDK tool-call
  identity, not invented anew on each callback. Fake-provider retry tests and
  native dispatch tests are distinct from unverified live callback/retry behavior.
- On restart, unfinished runs become interrupted. They are never automatically
  replayed. Domain receipts are the authority for completed writes.
- Chat clearing erases chat-bearing tool payloads. If a minimal retry tombstone
  must remain, it contains only opaque IDs/status, never message or todo content.
- New conversation IDs and one-use approvals prevent a cleared conversation
  from authorizing later writes.
- No automatic retention expiry in the MVP. Deletion is logical removal from
  live application storage, not a claim of forensic erasure from disks or backups.

## 5. HTTP and error contracts

Implemented endpoints share the catch-all handler; all mutations require
validated same-origin JSON requests with the application marker.

| Surface | Contract |
| --- | --- |
| `GET /api/state` | Todos, scoped snapshots, selected source counts/revision, integration status, chat and approvals |
| `GET /api/settings` | Committed identities/labels and safe connection/deprecation status; no upstream discovery |
| `POST /api/settings/catalog` | Metadata-only accessible project/team/repository discovery; explicit partial errors |
| `POST /api/settings` | Expected revision and both UUID/project-ID lists; validate additions, then atomic save |
| `POST /api/todos` | Shared create/edit/complete/reopen/delete/reorder commands, revisions, operation receipts |
| `POST /api/reference` | Parse a selected-source URL; this is not live area/access verification |
| `POST /api/reference/check` | Current-scope, assignment/area and upstream-access verification |
| `POST /api/refresh` | Return `202` with local state; coalesce with an active cycle |
| `POST /api/chat` | Validated prompt and request ID; streamed NDJSON through `fetch` |
| `POST /api/chat/cancel` | Stop further work; retain committed tool outcomes |
| `POST /api/approval` | Explicit confirm/reject against server-owned exact deletion |
| `POST /api/chat/clear` | Confirmed clear, including SDK state; expose incomplete cleanup |
| `GET /api/health` | Local process/storage readiness and separate integration configuration status |

New or changed non-null todo references use the same async preflight for HTTP
and AI callers. Verify outside the SQLite transaction, then recheck the settings
revision and caller authorization before committing. Unchanged references and
local-only edits do not depend on Azure availability.

List endpoints use stable cursors and bounded page sizes; the dashboard initially
renders only a bounded slice. Server-rendered initial data and browser refreshes
use the same service contracts.

HTTP JSON errors use a stable code, safe message, optional field errors, and
correlation ID. Distinguish validation (`400`), missing resources (`404`),
conflicts (`409`), unavailable integrations (`503`), and internal errors (`500`).
Credentials and raw upstream errors never enter these bodies.

Streamed assistant events have a discriminated `type`, run ID, sequence, and typed
payload: text delta, tool started/result, approval required, run completed/failed/
interrupted. Once streaming begins, failures use an explicit error event and
durable run status rather than pretending a successful HTTP status means success.

## 6. Synchronization

1. Capture the committed source revision. Empty lists make no content requests.
2. Resolve the PAT identity and, when needed, independent review-group membership.
3. Validate selected sources and resolve selected teams' area rules. Retrieve
   assigned work only within the selected area union, and PRs only from selected
   repositories. Discovery of all candidates is separate from synchronization.
4. Normalize fields without assuming process-specific type/state names.
5. Recheck the revision before committing each project-ID/repository snapshot.
6. Record errors without replacing a failed scope's old data.
7. Schedule the next non-overlapping cycle after the configured delay. Saving
   during a cycle discards superseded results and queues one immediate follow-up.

Use small bounded upstream concurrency, timeouts, and bounded retry budgets.
Respect continuation tokens, endpoint batch limits, throttling, and query result
ceilings. Do not infer that every Azure DevOps endpoint paginates the same way.

Successful empty snapshots remove old matches. Partial results are not promoted
to complete snapshots. Removing a saved scope immediately excludes its cache
from current reads. Reselection may reuse eligible last-good data with its real
timestamps and errors. Missing board metadata never grants project-wide scope.

The browser refreshes **local** dashboard data every 15 seconds while visible and
on focus. It never drives upstream synchronization. Manual refresh joins an
active cycle or starts a new one and returns its identity.

See [ADR-0004](adr/0004-background-sync.md) for the accepted scheduler decision
and its verified hosting constraints.

### Project, board, and repository scope

An organization contains projects. Work items belong to a project; teams use
Boards/backlogs configured by area paths, iterations, and team settings.
Git repositories also belong to projects, and PRs belong to repositories.
Boards are not children of repositories.

A work item can have no code association, or links to changes/PRs in more than
one repository. The clickdummy's single `data-repo` label on each work-item row
does not establish a valid production mapping.

Settings lists readable team-board scopes and enabled repositories across every
PAT-accessible project. Projects group choices; they are not a third selection.
Project listing follows continuation tokens; readable teams use `$mine=false`
and complete `$top`/`$skip` paging. Repository listing has no documented paging
mechanism; unexpected continuation is reported incomplete.

SQLite is the only selection authority. New and upgraded installations start
empty; discovery, old environment variables, and retained caches never enable
sources. Selected team-area unions constrain assigned work across all types and
states, with case-insensitive path-boundary/includeChildren matching. Work batch
responses are rechecked for project, assignment, and area. Selected repositories
independently govern both PR datasets.

Team-area metadata and labels retain last-good values with explicit errors.
Only positively matched items can remain available when metadata is stale.
Current cache readers filter again against the selection. Live work detail and
new reference checks fetch minimal project/area/assignment fields before full
bodies or discussions, and reject superseded results before exposure.

Legends and single-select chips remain presentation over the eligible dataset;
they do not change saved scope or grant agent access. Team areas do not assert
exact board columns, types, or iteration visibility. See
[ADR-0015](adr/0015-persisted-azure-devops-settings.md).

Team/group review support is in scope. The user's positive vote hides the PR from
review requests. Otherwise, an unapproved individual reviewer entry keeps it
visible. For group-only assignment, hide it only when every relevant reviewer
group has a positive vote; unknown outcomes cannot count as approval.

Membership traversal, directory-group visibility, required permissions, and
mapping Graph descriptors to reviewer identities remain OPEN-08/G0. A team list
alone is not complete group membership. Missing data must not masquerade as a
complete review list or a satisfied request. See the
[Azure DevOps concept](azure-devops-concept.md) and
[ADR-0009](adr/0009-ado-scope-and-review-visibility.md).

## 7. Next.js lifecycle

Use production Node hosting, not development-mode behavior as evidence:

- Apply migrations in the container startup sequence before accepting writes.
- Use Next.js instrumentation's Node-only startup hook to initialize server
  resources and request the initial non-blocking sync.
- Register an idempotent coordinator per serving process and exactly one
  production app replica.
- Prove in G0 that the selected build/hosting mode does not create duplicate
  coordinators in workers. If it does, revise ADR-0004 before implementation;
  do not hide the problem behind a module-level boolean.
- Do not open databases, start timers, invoke Copilot, or require secrets during
  static compilation.
- Private dashboard/health/chat data and upstream data reads use explicit dynamic/
  no-store behavior; SQLite is the intentional cache, not accidental Next.js
  static or fetch caching.
- Shutdown stops scheduling, rejects new runs, interrupts active work, and closes
  the SDK/DB cleanly.

A persistent Node deployment is a constraint of this architecture. Moving to
serverless, multiple replicas, or an external scheduler requires a new ADR.

G0 verified the lifecycle above with Next.js 16.4.3, regular production Node
hosting, shared process-owned resources, and one replica. This does not verify
live synchronization or replace application shutdown/cancellation tests.
See the [recorded evidence](verification/g0.md#3-production-lifecycle-evidence).

## 8. Copilot runtime and tools

### Runtime boundary

Use one server-owned SDK client with an explicit token and a dedicated runtime
working directory. Persist SDK state separately from SQLite under the same
volume. Never mount or borrow the user's VS Code/CLI authentication directories.

The child runtime receives only explicitly required environment values:
Copilot credentials, dedicated state/work paths, necessary OS variables, and
explicit runtime configuration. It does not inherit Azure DevOps credentials or
the application's full environment.

The SDK ships a platform runtime in current Node releases. Verify image contents,
native dependencies, process startup, and package tracing for the pinned version
instead of assuming a Next.js standalone bundle contains all runtime files.
A regular production Node image is preferred over a fragile minimal image.

### Allowed application tools

| Capability | Tools |
| --- | --- |
| Local reads | List todos, get todo |
| Azure DevOps reads | List assigned work/reviews/own PRs; get scoped work-item or PR details/discussion |
| Direct local writes | Create, edit, complete, reopen, reorder todo |
| Gated deletion | Request deletion approval only |

There is **no** model-facing “confirm deletion” or unrestricted delete tool.
The confirmation route validates the pending server-owned approval and calls the
todo service independently of model-generated text.

Default deny all SDK runtime permissions. Use an explicit tool allowlist rather
than a denylist that might miss newly added built-ins. Disable automatic
instruction/skill/plugin loading and inherited local configuration. No remote
session publishing, arbitrary HTTP, shell, filesystem, MCP, or subagents.
Do not copy an SDK sample's `approveAll` policy into this application.

### Per-turn authorization

The user selected automatic intent classification with no write-mode switch.
Before action dispatch, an application-owned step records `read`, `mutate`, or
`clarify` for the current request. The proposed classifier receives only the user
message and necessary conversation context, not retrieved external instructions,
and has no mutation tools of its own.

Validate classifier output; invalid/uncertain results ask for clarification and
enable no writes. `read` exposes read tools; `mutate` may additionally expose the
bounded todo operations. Every handler still checks scope, target, revision,
retry identity, and the independent deletion policy.

Automatic classification can be wrong. The user accepted the risk of unintended
non-delete updates in exchange for a natural-language-only workflow. Do not claim
that read-only questions can never be misclassified. Hard prohibitions on
arbitrary tools, secret access, Azure DevOps writes, and model-approved deletion
remain independent of classification.

The implemented tool-free classifier uses a structured Zod response and only the
current user instruction. Fake-provider tests verify tool selection and hard
limits for each intent. A live representative/adversarial classification corpus
remains account-specific acceptance; observed accuracy is never a universal
safety claim. Changing to a mode switch requires a new product decision.
See [ADR-0007](adr/0007-automatic-ai-intent.md).

### Conversation and recovery

- Persist the user's message and run before dispatch.
- Store visible assistant messages and structured tool outcomes in SQLite.
- Keep SDK session ID and required runtime state on persistent storage; SQLite
  history alone is not assumed sufficient for SDK resume.
- Reapply current tools, safety policy, and scoped identity on every resume.
- On disconnect/cancel, abort dispatch and retain any committed write outcomes.
- Enforce one active run, a 120-second total budget, and 10 tool invocations;
  classification is inside that budget, not an unbounded preceding workflow.
- On startup, reconcile interrupted runs without replaying mutations.
- Clearing is a resumable local cleanup operation: invalidate approvals, delete
  app content, remove the associated SDK state using the supported SDK API, and
  report incomplete cleanup explicitly. Never delete the entire shared volume
  as a substitute.

## 9. Deployment and configuration

Connection configuration remains server-side. Choose sources separately in
Settings; no source is enabled by default. The template is [.env.example](../.env.example):

| Variable | Meaning |
| --- | --- |
| `AZURE_DEVOPS_ORG` | Organization identifier; default `vertigis` |
| `AZURE_DEVOPS_PROJECTS` | Deprecated and ignored; reported in Settings |
| `AZURE_DEVOPS_REPOSITORY_IDS` | Deprecated and ignored; reported in Settings |
| `AZURE_DEVOPS_PAT` | Read-only Azure DevOps token |
| `AZURE_DEVOPS_USER_EMAIL` | Optional assertion against resolved PAT identity |
| `COPILOT_GITHUB_TOKEN` | Explicit GitHub credential supported by the pinned SDK |
| `COPILOT_MODEL` | Model identifier; default `gpt-4.1`, subject to account availability |
| `SYNC_INTERVAL_SECONDS` | Integer 30–3600; default 180 |
| `DATABASE_PATH` | SQLite path; Docker sets `/data/dashboard.db`, host development defaults to `.data/dashboard.db` |
| `COPILOT_STATE_PATH` | SDK state directory; defaults beside the database, `/data/copilot` in Docker |
| `APP_ORIGIN` | Local application origin; default `http://localhost:3000` |

Configuration groups:
- SQLite/local todo configuration is required. Core storage validation or
  migration failure prevents normal writable operation.
- Validate each integration independently. Entirely absent Azure DevOps variables
  (including a blank token alone) disable it explicitly; partial or invalid
  non-token settings produce a visible
  `configuration_error` for Azure DevOps only.
- Selection UUID syntax is validated locally; project ownership, accessibility,
  enabled state, and team areas are checked before adding sources. Failures
  degrade that integration explicitly, not the local todo service. Do not require
  external calls during build or block local readiness on Azure DevOps.
- An absent/blank Copilot token with no explicit optional settings disables chat
  generation explicitly.
  Partial or invalid settings produce `configuration_error` for Copilot only.
  Stored transcript remains readable in either state, and local todos still work.
- Invalid integration settings never silently fall back to defaults or a different
  credential/model. Record redacted, actionable diagnostics in UI and logs.
- Validly configured but failing authentication/upstream calls report runtime
  integration errors, distinct from absent or malformed configuration.
- Secrets are runtime-only and never use `NEXT_PUBLIC_` variables or Docker
  build arguments.
- There is no MVP provider-selector variable: Copilot is the chosen integration.
- No OAuth/login flow, `.env` editor, token submission endpoint, or credential settings UI
  for secrets is exposed in the browser.

The container listens internally on the required interface while Compose
publishes only `127.0.0.1:3000:3000`. Run as a non-root user with a writable data
volume and appropriate ownership. Keep at one application replica.

Host `.env` access and volume backups require OS-level protection. The app cannot
protect data from a user with equivalent host/container privileges.
No automatic retention expiry removes todos or chat. Quantitative performance
benchmarks/reference hardware are deferred and do not gate this architecture's
MVP acceptance. See [ADR-0010](adr/0010-local-first-failure-isolation.md).

## 10. Sources and implementation checks

Official documentation checked during planning on 2026-10-26:

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js instrumentation](https://nextjs.org/docs/app/guides/instrumentation)
- [Copilot SDK overview and default tools](https://github.com/github/copilot-sdk/blob/main/README.md)
- [Copilot SDK Node.js reference](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- [Copilot authentication](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- [Copilot session persistence](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)
- [Azure DevOps structure and membership evidence](azure-devops-concept.md)

These are moving upstream documents, not substitutes for testing the pinned
package versions. Actual application results and unperformed live checks are
recorded in the application report; ADR-0011 supersedes the former G0-before-
implementation sequencing rule.
