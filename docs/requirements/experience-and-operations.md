# Experience and Operations

Status and interpretation: [requirements baseline](REQUIREMENTS.md).
All active behavior and acceptance contracts below are approved in baseline v1.
OPS-006 is explicitly deferred and does not gate MVP acceptance. Approval is not
evidence that the UI, deployment, or tests already exist.

The [proposed settings increment](settings.md) adds Settings navigation and
SQLite-backed source selection, with empty initial scope instead of environment
defaults. Credentials remain server-side; persisted settings join the existing
backup boundary. It is not implemented and does not change the baseline
descriptions below.

## Experience

### UX-001 — Dashboard hierarchy

The application MUST provide a single main dashboard with todos as its primary
component.

Acceptance:
- Assigned work items, review requests, and own PRs use three tabs in one Azure
  DevOps panel below todos, with exactly one visible view at a time.
- Each tab has a small count bubble, including zero, based on every cached row
  in that dataset. Counts update with the cache and retain last-good rows during
  failures; stale/incomplete data remains indicated on its tab and in its view.
- Work items use a warm palette; PRs use a separate cool palette. Tab accents,
  count bubbles, legends, and row markers preserve that distinction; color
  supplements names rather than replacing them.
- Desktop chat is persistently accessible in a side panel; narrow screens use an
  accessible drawer without removing todo functionality.
- Use the user-provided clickdummy's visual hierarchy: left context rail, todos
  at the top of the main column, the tabbed DevOps panel, and right-hand chat.
- There is no separate Daily Todos page or global repository filter.
- Noninteractive legends show PR repositories and the PAT user's team-board
  area scopes. Dots and row edges use consistent colors alongside textual
  labels. Multiple board matches are retained; unknown or stale mapping is
  explicit. Legends never hide PRs, work items, or local todos.
- The tab body provides colored, single-select team chips for work items and
  repository chips for both PR views. The first chip in stable legend order is
  initially active; known scopes retain zero counts. Each tab retains its own
  selected identity through tab changes/cache updates, falling back to the first
  available chip if that identity disappears. Reload starts with the first chip.
- Every overlapping team match includes the work item. Nonempty "No team" and
  "Assignment unknown" chips are separate: only a successful, fresh mapping
  establishes no match. Missing area metadata or unresolved/stale nonmatches
  remain unknown; last-good matching teams stay usable. Unexpected repository
  metadata is reachable through "Repository unknown".
- Chip selection is local presentation only, not a synchronization, todo, or
  agent-context filter. Per-chip counts may overlap; dataset tab totals and
  all stale/error notices remain independent of the selected chip.
- External navigation opens Azure DevOps rather than an in-app work-item editor.

See the [frontend concept](../frontend-concept.md) for the reference and required
departures from demo behavior.

### UX-002 — Dark-first responsive design

The UI MUST default to dark mode and remain usable at narrow and desktop widths.

Acceptance:
- At 375px, 768px, and 1440px viewport width, primary actions remain visible without
  page-level horizontal scrolling.
- Main content scrolls within the central app column rather than the document.
  Sidebar and chat scroll independently; the mobile drawer does not scroll the
  underlying workspace.
- Loading, empty, stale, and failed states have distinct text, not just colors.
- A light theme is not required for the MVP.

### UX-003 — Keyboard accessibility

All primary workflows MUST work without a pointer.

Acceptance:
- Add, edit, complete, reopen, delete, reorder, refresh, and chat are keyboard
  accessible with visible focus.
- Enter submits a valid todo or chat message exactly once. Shift+Enter inserts a
  chat newline. IME composition, repeated keydown events, blank input, pending
  runs, and blocked cleanup do not accidentally submit.
- Dialogs/drawers have accessible labels, sensible focus management, Escape
  dismissal where safe, and return focus to their trigger.
- Semantic HTML and accessible names are used; drag-and-drop is not the only
  reordering mechanism.
- DevOps tabs use labelled tab/tabpanel relationships and a single tab stop.
  Left/Right arrows wrap between tabs; Home/End select the first/last tab.
  Tab reaches the selected panel. Switching views does not issue upstream reads
  or mutations, reset todos/chat, or reset the selected tab during cache updates.
- Scope chips are named buttons with one pressed state per tab and keyboard
  activation. Tool outcomes use native keyboard-accessible disclosures.

### UX-004 — Motion

Tailwind CSS and Framer Motion MUST support restrained, functional visual feedback.

Acceptance:
- Motion does not delay adding or completing a todo.
- `prefers-reduced-motion` disables non-essential movement.
- Focus and status announcements remain correct during animated list changes.

### UX-005 — Safe content presentation

External content and assistant output MUST be rendered without executing
untrusted markup.

Acceptance:
- Raw HTML is not executed; links accept only safe, validated destinations.
- Saved and streaming assistant messages support Markdown headings, emphasis,
  lists, quotes, code, and GFM tables/task lists. User text and tool outcomes
  remain literal; generated task checkboxes are not mutation controls.
- Rendering does not load external images or embeds. Unsupported/unsafe link
  destinations remain readable text, not clickable navigation.
- Azure DevOps links target the configured organization and object scope.
- Secrets and upstream stack traces are not shown in error messages.
- Tool outcomes start as one compact, collapsed line with tool/action and outcome
  state. Their complete literal payload and timestamp remain expandable.
  An unsuccessful envelope is visibly failed even if its transcript status is
  complete; pending deletion approval is not presented as completed deletion.
  Legacy/unrecognized tool content is explicitly unstructured, never inferred
  successful. Long payloads stay inside the chat.

### UX-006 — Action feedback

The UI MUST distinguish acknowledged persistence from work still in progress.

Acceptance:
- Pending mutation controls prevent duplicate submission.
- Errors preserve user input and offer a meaningful retry or correction.
- No operation is presented as successful before the server commits its result.

### UX-007 — Interface language

The application UI MUST be English without requiring a language selector.

Acceptance:
- Navigation, forms, status labels, validation, and safe error messages are English.
- The assistant accepts natural-language messages such as English or German;
  this does not require translating the entire application UI.

### UX-008 — Timestamp display

Persisted timestamps MUST represent UTC instants and be presented using the
browser's local timezone.

Acceptance:
- Viewing the same record from browsers in different timezones does not change
  the stored instant.
- A timezone/day boundary does not copy, complete, reopen, or otherwise mutate a
  todo.
- User-facing absolute timestamps use local display; relative freshness is
  derived from the same instant, not a second date-based business rule.

## Operations and quality

### OPS-001 — Local deployment

The application MUST run through Docker Compose on Linux/WSL2 and be accessible
at `http://localhost:3000`.

Acceptance:
- Host publishing binds explicitly to `127.0.0.1:3000`, not all interfaces.
- One app container runs the long-lived Node server and managed Copilot runtime;
  SQLite and SDK state use persistent local storage.
- No database server, queue, cloud hosting, or reverse proxy is required.

### OPS-002 — Local trust boundary

The login-free application MUST reject cross-origin or untrusted-host mutations.

Acceptance:
- Mutating routes validate the expected origin/host and require the documented
  content type and same-origin request protections.
- There is no permissive CORS policy; cross-site requests cannot mutate todos or
  trigger AI actions.
- Localhost access is not advertised as user authentication. Other local
  processes/users with equivalent OS access remain inside the trust boundary.

### OPS-003 — Validated configuration

Configuration MUST be supplied server-side and validated by core/integration
scope during startup.

Acceptance:
- Invalid/unusable core storage configuration or failed migrations prevent normal
  writable operation and produce actionable, redacted errors.
- An entirely unconfigured integration is explicitly disabled. A partially or
  invalidly configured integration has a visible configuration-error state; only
  that integration is blocked, not local todos or another valid integration.
- Invalid Azure DevOps intervals/scope or Copilot model/state-path settings are
  attributed to the relevant integration, not silently defaulted or ignored.
- Expired credentials and unavailable upstream services are integration/runtime
  errors, distinct from absent/invalid configuration, and do not erase local data.
- The UI and structured logs identify the affected integration and safe correction
  details; errors do not disclose secret values.
- `.env`, database files, SDK state, and logs containing personal data are excluded
  from source control when implementation begins.

### OPS-004 — Durable storage

Acknowledged local mutations MUST survive an orderly application/container
restart.

Acceptance:
- Migrations apply before normal writes and are not run during the image build.
- Foreign keys, transactions, and versioned migrations enforce data integrity.
- A failed migration prevents serving writable application traffic.
- Write failures are visible. Database corruption is never “fixed” by silently
  replacing the file with an empty database.

### OPS-005 — Independence from upstream availability

Todo operations and stored-chat reads MUST remain usable during Azure DevOps or
Copilot outages or integration configuration errors.

Acceptance:
- Local todo operations do not wait for either external service.
- Cached integration data is visibly stale; new AI answers can fail independently.
- Fixing an integration's configuration and restarting can restore that integration
  without resetting local records.
- External availability is not a prerequisite for local readiness.

### OPS-006 — Local performance

Status: Deferred — outside baseline v1 MVP acceptance.

The user chose not to prioritize performance benchmarking at this stage.
Retain this ID for traceability; do not reuse it for a different obligation.

MVP disposition:
- No mandatory benchmark fixture, reference hardware, percentile measurements,
  latency thresholds, or dedicated performance tuning is required.
- Ordinary UI usability and functional quality requirements remain active.
- Reactivation requires a separate decision defining test data, environment,
  metrics, and acceptance thresholds; no earlier draft values remain binding.

### OPS-007 — Operational visibility

The server MUST emit structured, redacted logs and expose local health status.

Acceptance:
- Logs include event, timestamp, severity, correlation ID, and relevant scope.
- Credentials, prompts, full external payloads, and message bodies are not logged
  by default.
- Liveness and local readiness distinguish process health, usable persistence,
  and degraded integrations.

### OPS-008 — Backup and recovery

The operational documentation MUST describe a consistent backup and restore.

Acceptance:
- The initial procedure stops the app cleanly, copies the complete persistent data
  including SQLite and Copilot session state, then restarts it.
- A restore exercise verifies todos, references, chat transcript, and SDK resume.
- Restoring an older backup can restore previously deleted records; this is
  disclosed. Backups and the host filesystem are the user's responsibility.
- SQLite is not encrypted by the application; host/disk protection is required
  for sensitive local data.

### OPS-009 — Release verification

The MVP MUST pass the documented type, lint, formatting, build, and behavior checks.

Acceptance:
- Vitest covers domain rules, persistence, integration contracts, and failure paths.
- Playwright covers the primary UI flows, keyboard behavior, reduced motion,
  concurrent changes, and degradation.
- Core automated suites use mocked upstream services; optional real smoke tests
  use explicit credentials and approved data.
- No passing test is inferred from documentation alone.

### OPS-010 — Manual retention

Todos and the local conversation MUST remain stored until the user explicitly
deletes the todo or clears the conversation through the confirmed flows.

Acceptance:
- No automatic age-based expiry removes open/completed todos or chat messages.
- Confirmed chat clearing follows AI-013, including associated SDK state, and does
  not delete local todos.
- Cache snapshot replacement and expiring deletion approvals do not constitute
  automatic deletion of the user's todos or chat.
- Backups/provider-side retention remain subject to the documented boundaries;
  manual local deletion is not a promise to erase those external copies.
