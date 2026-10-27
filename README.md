# DevDesk

A local, single-user developer dashboard with persistent todos, read-only Azure
DevOps work items and pull requests, and a bounded GitHub Copilot assistant.

The application is implemented. Local/offline verification and account-specific
live verification are tracked separately in the
[acceptance report](docs/verification/application.md).
The former up-front G0 blocker was explicitly lifted by the user; see
[ADR-0011](docs/adr/0011-integrated-delivery-and-verification.md).

Todos have no day assignment, rollover, automatic expiry, or daily copies.
The repository, documentation, and UI are English; chat accepts German too.

## Start

Prerequisites: Docker Engine and Docker Compose on Linux/WSL2, an Azure DevOps
read token, and a GitHub account with Copilot access.
No host Node.js installation, external database, or MCP server is required.

1. Edit `.env` locally. A blank file is prepared in this checkout; for a fresh
   checkout, run `cp .env.example .env` first. Do not overwrite an existing file.

   ```dotenv
   AZURE_DEVOPS_PAT=
   COPILOT_GITHUB_TOKEN=
   ```

2. Start:

   ```sh
   docker compose up -d --build --wait
   ```

3. Open **http://localhost:3000**.

Only the two token values are needed for the selected workspace. Either can
remain blank: local todos still work, and the corresponding integration shows
that it is not configured.

Defaults:
- Azure DevOps organization: `vertigis`.
- Project-wide assigned work items: `Utilities`, including completed states.
- PR repositories: `network-locator` and `Utilities`, explicitly allowlisted.
- Background refresh: immediately at startup, then 180 seconds after completion.
- Copilot model: `gpt-4.1`. Set `COPILOT_MODEL` only if your account requires a
  different supported model; there is no silent model fallback.

### Tokens

**Azure DevOps:** create a PAT for `vertigis`, with access to the selected project
and repositories. Use read-only **Code**, **Work Items**, **Graph**, and
**Project and Team** permissions. Graph can be hidden under the full scope list.
Organization policies, PAT expiry, and project permissions still apply.
Missing Graph access degrades review requests without disabling todos or other
successfully synchronized datasets.

**Copilot:** use a fine-grained GitHub personal access token owned by your
personal account (not an organization), with the account permission
**Copilot Requests**, or another explicit user token supported by the
[SDK authentication contract](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md).
Classic `ghp_` PATs are not supported. The account must have Copilot/model access
and available usage; organization policies may require additional approval.
DevDesk never borrows your VS Code, GitHub CLI, or host Copilot login.

Keep tokens in `.env` only, not chat or source code. Protect the file with
`chmod 600 .env`. It is ignored by Git and excluded from the Docker build.
Do not share resolved Compose configuration: it can contain token values.

After changing tokens or optional settings, **recreate**, not just restart:

```sh
docker compose up -d --force-recreate --wait
```

Optional settings and scope UUIDs are in [.env.example](.env.example).

## Use

- Add a title, press Enter, and manage todos with Edit, Complete/Reopen, and
  confirmed deletion. Drag an open todo's grip with mouse/touch to reorder.
  Keyboard: focus the grip, Space to pick up/drop, arrows to move, Escape to
  cancel. Up/Down buttons are also available. Ordering persists after reload.
- Assistant replies render Markdown, including code blocks, lists and tables,
  while streaming and after reload. Raw HTML and remote images are disabled;
  only known ADO source links are clickable. User/tool text remains literal.
- Tool outcomes start as one compact line with an action and outcome state.
  Expand by click or Enter/Space for the complete literal payload and timestamp.
  Failed outcomes and pending deletion approvals are labelled, not called success.
- Completed items remain in the initially collapsed section indefinitely.
- Edit a todo to attach one selected work-item or PR URL. Unverified or unavailable
  references do not prevent ordinary todo operations.
- Assigned work items, review requests, and your PRs share three tabs below todos.
  Count bubbles include all cached items, even zero; stale data is marked.
  Use Left/Right or Home/End while a tab is focused to switch views.
- The sidebar legends identify PR repositories and your ADO team-board scopes.
  Matching row dots and colored edges supplement the text. Inside each tab,
  colored chips select one team or repository; the first is initially active.
  Each tab remembers its own selection until reload. Chip counts are per scope;
  tab bubbles still count the complete cached dataset.
- Work items matching multiple teams appear in every matching team chip.
  Separate "No team" and "Assignment unknown" chips keep unmatched and unresolved
  rows reachable. Last-good matches survive stale metadata; unmatched stale
  mapping cannot establish "No team". Chips only filter the local view, never
  the synchronized scope, todo references, or the agent's cached dashboard reads.
- Work items use warm gold/red colors; PRs use a separate cool violet/teal/blue
  palette. Tab accents and counts preserve the distinction alongside the legends.
- Team-board annotations use your teams' area paths and `includeChildren` rules,
  not board columns, iterations, or work-item-type visibility. All matches are
  shown; missing, stale, and unavailable mappings are explicit.
- Enter sends a chat message; Shift+Enter inserts a newline. IME composition
  does not send. Blank, pending, and cleanup-blocked submissions are prevented.
- The central workspace scrolls independently inside the app. The desktop chat
  retains its own conversation scrollbar; narrow screens use the chat drawer.
- Ask Copilot about the dashboard, request scoped details, or explicitly ask for
  todo changes. Suggestions are not automatically executed. There is no manual
  write-mode switch; automatic intent classification can be wrong.
- AI deletion always needs the separate exact UI confirmation. Approvals expire
  after five minutes. Cancellation stops future actions, not committed changes.
- Clear confirms removal of the local transcript and app-owned SDK session
  state. It does not delete todos or promise deletion of provider-side retention
  or backups. Failed cleanup remains visible and retryable.

On request, selected todo and Azure DevOps context is sent to GitHub Copilot under
your account policies. External discussions are treated as data, not instructions.
The assistant has no general shell, filesystem, browsing, MCP, delegation, or
Azure DevOps write tool. The managed runtime remains a trusted native process;
the tool policy and minimal child environment are not an OS sandbox.

## Operate

```sh
docker compose ps
docker compose logs --tail=100 app
curl --fail http://localhost:3000/api/health
docker compose stop
docker compose up -d --wait
```

Health reports local storage readiness and integration configuration separately.
Actual authentication, quota, model, or sync failures appear in the dashboard;
`ready: true` does not certify upstream access. Errors retain last-good snapshots.
Never-synchronized, empty, stale, and failed datasets have distinct states.

One non-root app replica owns polling, SQLite, and the SDK child runtime.
The image includes system CA certificates for the native SDK's HTTPS requests;
Node.js's bundled trust roots alone are not sufficient for that child process.
Compose publishes only `127.0.0.1:3000`. Do not expose it on a network, put it
behind an unreviewed public proxy, or scale the app: it has no multi-user login.
Persistent state is stored in the named `devdesk-data` Compose volume, not the
container filesystem. Do not use `docker compose down -v` for restart or upgrade.

### Backup and restore

The volume contains SQLite, its journal files, and SDK context. Stop the app and
copy the **entire volume**; do not copy only an open database file.
Run these commands from the same project directory and with the same Compose
project name used to start the app:

```sh
backup="$HOME/devdesk-backup-$(date -u +%Y%m%dT%H%M%SZ).tgz"
umask 077
docker compose stop app &&
docker compose run --rm --no-deps --entrypoint tar app -C /data -czf - . > "$backup" &&
docker compose run --rm --no-deps --entrypoint tar -T app -tzf - < "$backup" > /dev/null &&
docker compose up -d --wait &&
printf 'Backup: %s\n' "$backup"
```

Protect the archive as sensitive local content and store it outside the checkout.
Back up `.env` separately using your own secure secret storage.

To restore to a **fresh, empty** Compose data volume:

```sh
docker compose build &&
docker compose run --rm --no-deps --entrypoint tar -T app -C /data -xzf - < "$backup" &&
docker compose up -d --wait
```

Stop and separately back up any existing installation first. Do not extract into
a non-empty live volume: old WAL/SDK files can invalidate the restored state.
Set `backup` to the existing archive path if using a new shell.
Restore with the same app version first, then upgrade normally. Check todos,
stored chat, and (with a valid token) conversation continuation after restore.
App/volume access and backups are protected by host permissions, not encryption
or a separate security boundary from the same OS user.

### Upgrade

Back up, update the checkout, and run `docker compose up -d --build --wait`.
Migrations run at server startup, not build time. A migration or storage failure
blocks normal writable startup instead of replacing the database.
Use a pre-upgrade backup and matching old image for rollback; automatic schema
downgrades are not implemented.

## Develop and verify

Use Node.js 24 LTS and `npm ci --ignore-scripts`:

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
```

The default tests are offline. They include fake-provider domain tests and an
actual bundled-runtime policy/persistence test without model calls.
`npm run test:e2e` runs Chromium against an **isolated** running app, by default
`http://127.0.0.1:3000` (`DEVDESK_TEST_URL` overrides it). These tests create and
change records; never point them at your normal data volume.
Use the Playwright 1.64.1 browser image or matching installed browser binaries.

Account-specific live authentication, model turns, full directory-backed group
parity, and real conversation restoration cannot be certified without your
tokens. They are not silently treated as passing checks or an up-front
implementation blocker. See the [acceptance report](docs/verification/application.md).

### Publishing the source

- Never force-add ignored credentials, databases, SDK state, logs, test outputs,
  or backup archives. A directory/archive upload can include ignored files;
  `.gitignore` only protects ordinary Git staging.
- Public documentation omits live team/area names, workspace inventories, and
  real user-data counts. Synthetic fixtures, test totals, and technical
  measurements are not live account data.
- The checkout still contains workspace-specific configuration defaults and
  provider identifiers. These are not credentials, but require organizational
  approval before public sharing.
- Review every branch/tag intended for publication and its history, including
  commit author/committer identities. Editing the current files does not remove
  information from earlier commits. No history cleanup is implied by a current
  checkout review.
- Publishing source does not make the application safe for public hosting:
  it remains a local single-user service without a multi-user login.

## Concept documentation

| Document | Purpose |
| --- | --- |
| [Requirements](docs/requirements/REQUIREMENTS.md) | Approved baseline and stable acceptance contracts |
| [Todos](docs/requirements/todos.md) | Persistent list behavior |
| [Azure DevOps](docs/requirements/azure-devops.md) | Read-only views, scope, synchronization, and group review rules |
| [Azure DevOps concept](docs/azure-devops-concept.md) | Selected project/repositories and structural conclusions |
| [Assistant](docs/requirements/assistant.md) | Intent, permissions, run limits, and clearable conversation |
| [Experience and operations](docs/requirements/experience-and-operations.md) | UI, reliability, and operational requirements |
| [Frontend concept](docs/frontend-concept.md) | Accepted visual baseline and responsive behavior |
| [Clickdummy](clickdummy.html) | Unchanged design reference, not business logic |
| [Architecture](docs/architecture.md) | Actual modules, data ownership, configuration, and deployment |
| [ADRs](docs/adr/README.md) | Recorded decisions and the explicit implementation authorization |
| [Code style](docs/code-style.md) | English, TypeScript strict, formatting, and quality commands |
| [Implementation plan](docs/implementation-plan.md) | Delivery milestones and remaining account-specific acceptance |
| [Application verification](docs/verification/application.md) | Actual checks, results, and honest limits |
| [Historical G0 report](docs/verification/g0.md) | Earlier isolated compatibility evidence, not current app acceptance |
