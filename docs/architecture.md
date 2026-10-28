# Architecture

Status: implemented for [baseline v1](requirements/REQUIREMENTS.md), with delivery
authorized by [ADR-0011](adr/0011-integrated-delivery-and-verification.md).
The [application report](verification/application.md) separates verified local
behavior from outstanding account-specific live acceptance. The earlier
[G0 report](verification/g0.md) remains historical compatibility evidence.

Planned, not implemented: [Azure DevOps settings](requirements/settings.md) and
[ADR-0015](adr/0015-persisted-azure-devops-settings.md) propose persistent,
application-wide source selection with organization-wide discovery and an empty
initial scope. The architecture and environment variables below describe the
current application, not that proposed increment.

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

```text
src/
    app/                  Next.js pages, route handlers, layouts
    components/
        dashboard.tsx     Workspace composition
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

Proposed endpoints; all mutations require validated same-origin requests.

| Surface | Contract |
| --- | --- |
| `GET /api/dashboard` | Todos, cache snapshots, revisions, integration freshness/status; bounded lists |
| `POST /api/todos` | Create a validated todo with client operation ID |
| `PATCH /api/todos/:id` | Edit/complete/reopen with expected todo revision |
| `DELETE /api/todos/:id` | Confirmed UI deletion with revision and operation ID |
| `PUT /api/todos/order` | Ordered open IDs + expected list revision + operation ID |
| `POST /api/sync` | Return `202` and cycle ID; coalesce with an active cycle |
| `GET /api/chat` | Persisted conversation, paged messages, active run/approval state |
| `POST /api/chat/runs` | Validated prompt and client request ID; streamed events through `fetch` |
| `POST /api/chat/runs/:id/cancel` | Stop further work; report committed tool outcomes |
| `POST /api/chat/approvals/:id` | Explicit confirm/reject against server-owned exact deletion |
| `DELETE /api/chat` | Confirmed clear, including SDK state; expose incomplete cleanup |
| `GET /api/health/live` | Process health only |
| `GET /api/health/ready` | Local DB/migration readiness and separate degraded integrations |

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

1. Read validated config and resolve the authenticated Azure DevOps identity.
2. Enumerate configured projects/repositories using complete endpoint-specific
   pagination.
3. Resolve review membership, then retrieve assigned work items, direct and
   group-derived reviewer requests, and own active PRs.
4. Normalize fields without assuming process-specific type/state names.
5. Commit a complete snapshot per dataset/project or dataset/repository scope.
6. Record errors without replacing a failed scope's old data.
7. Schedule the next non-overlapping cycle after the configured delay.

Use small bounded upstream concurrency, timeouts, and bounded retry budgets.
Respect continuation tokens, endpoint batch limits, throttling, and query result
ceilings. Do not infer that every Azure DevOps endpoint paginates the same way.

Successful empty snapshots remove old matches. Partial results are not promoted
to complete snapshots. Removing a configured scope excludes its cache from view;
re-adding it marks old data stale until a new successful sync.

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

After read-only metadata exploration, the user selected an explicit repository
allowlist. The initial workspace is Utilities, with network-locator and Utilities
as its PR repositories. Enumerate repository metadata only within configured
projects to validate the selection; fetch PR data only for selected repositories.
New repositories are not automatically included. An empty allowlist is not
equivalent to all repositories.

Assigned work items remain project-wide and user-assigned, with all states and
no team/board/area filter. UI repository and team-board legends are informational,
not display controls, and cannot expand the server allowlist.
The adapter independently caches the PAT user's project teams and their
`System.AreaPath` field-values, including `includeChildren`, in SQLite metadata.
Dashboard/chat reads expose these scopes with their own freshness and errors.
All matching team scopes annotate work items without asserting exact board
column, type, or iteration visibility; see
[ADR-0012](adr/0012-informational-legends-and-team-scopes.md).

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

Implemented configuration; only the two tokens are needed for the initial
workspace. The template is [.env.example](../.env.example):

| Variable | Meaning |
| --- | --- |
| `AZURE_DEVOPS_ORG` | Organization identifier; default `vertigis` |
| `AZURE_DEVOPS_PROJECTS` | Non-empty comma-separated allowed project identifiers/names; default `Utilities` |
| `AZURE_DEVOPS_REPOSITORY_IDS` | Non-empty comma-separated repository UUIDs; defaults to the two selected repositories |
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
- Repository UUID syntax is validated locally; project ownership, accessibility,
  and enabled state are checked during integration initialization. Failures
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
- No OAuth/login flow, `.env` editor, token submission endpoint, or settings UI
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
