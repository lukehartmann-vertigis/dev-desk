# Application Verification

Date: 2026-10-26  
Status: **Implemented and locally usable. Offline/native/container/browser
checks pass. Live startup, scheduled ADO sync, and basic chat are verified;
remaining account-specific acceptance is listed below.**

The user explicitly authorized delivery and removed the up-front G0 prerequisite
in [ADR-0011](../adr/0011-integrated-delivery-and-verification.md). This report
covers the real root application, not the historical compatibility fixture.
It does not certify every active baseline requirement without live evidence.
OPS-006 benchmarking remains deferred.

Publication note: live team/area identifiers, workspace inventories, and counts
of real work items, PRs, todos, or conversation entries are intentionally omitted.
Test-suite totals, synthetic fixture counts, and technical measurements remain
as reproducible verification evidence.

### Persistent source settings — 2026-10-28

The user explicitly authorized implementation of
[issue #1](https://github.com/lukehartmann-vertigis/dev-desk/issues/1) after the
requirements/ADR and implementation plan. The Settings increment replaces the
old environment scope; see [SET-001 through SET-011](../requirements/settings.md)
and [ADR-0015](../adr/0015-persisted-azure-devops-settings.md).

Verification:
- Typecheck, zero-warning lint, formatting, **128 offline tests**, and the
  production Next.js build pass. The generated migration adds only the
  organization-scoped settings table. Store tests reopen SQLite with nonempty
  board/repository selections and exercise revision conflicts, rollback, and
  empty legacy upgrades.
- Adapter/API tests cover metadata pagination, non-member readable teams,
  partial discovery, actual ownership, disabled repositories, no implicit
  sources, independent repository selection, positive team-area unions,
  assignment/project/area rechecks, retained labels, and save-time validation.
- Scope tests reject deselected cache/detail/reference reads and discard
  in-flight work/detail results when settings change. Known readable board areas
  remain usable with explicit staleness when another selected team is unavailable;
  no project-wide fallback is allowed. HTTP and AI todo paths share async
  preflight outside the write transaction, then revision/cancellation guards.
- **27 Chromium cases** pass against an isolated, token-free production instance,
  including Settings search, keyboard selection, Save/Cancel, reload, conflict,
  unavailable selection removal, empty navigation, origin protection, and
  preservation of todos/chat. Existing dashboard/review cases use explicit
  synthetic sources rather than depending on removed production defaults.
- Settings has no horizontal overflow at 375/768/1440px. Synthetic desktop and
  mobile Settings were visually inspected. Mocked catalog/save responses prove
  UI behavior only; durable nonempty selections are covered by SQLite tests,
  while the real API exercises durable empty selection and revision conflicts.
  The saved empty selection and revision also survived a production process restart.
- An explicitly blank invalid organization was also exercised on the production
  instance: local state and Settings remain readable, while Azure reports its
  configuration error. It cannot inherit a real organization's settings.

No live organization-wide catalog or selected-source acceptance was run with the
app's PAT for this increment. Earlier live observations below concern the
superseded scope and do not certify new catalog permissions, readable non-member
teams, or account-specific Graph parity. The normal user database and configured
credentials were not used by the mutating test suite.

### Shared navigation follow-up — 2026-10-28

Overview and Settings now reuse one responsive application frame instead of
Settings replacing the sidebar with a standalone form. Both navigation links
remain visible, the current page uses `aria-current="page"`, and Overview's
loading/error state retains navigation too. Settings has no unused chat column.
Dashboard controllers, legends, and chat stay page-owned; cancellation behavior
and data scope are unchanged.

Verification:
- Typecheck, zero-warning lint, formatting, production build, and the Docker
  image's **128 offline tests** pass.
- **31 Chromium cases** pass on the isolated, token-free production instance.
  New cases exercise round trips, direct entry/reload, active-page indicators,
  keyboard navigation, fixed navigation during content scrolling, no document
  overflow at 375/768/1440px, and access to Settings after dashboard loading fails.
  Existing todo ordering, chat, source settings, and contextual legend cases pass.

### Startup follow-up — 2026-10-27

A live startup exposed a connection-data API version mismatch: `7.1` returned
HTTP 400 (`VssInvalidPreviewVersionException`), while `7.1-preview.1` returned
HTTP 200 with an authenticated identity using the same locally configured PAT.
The adapter now explicitly selects the preview version for this endpoint, and
the fake transport asserts the exact version so offline tests catch regressions.
After rebuilding, the initial live synchronization completed successfully for all
configured scopes, and a subsequent automatic cycle refreshed every scope
without manual refresh, stale data, or scope errors. Typecheck, lint, formatting,
all 48 tests, and the production build passed during the rebuild.
This confirms the observed connection and synchronization behavior, not complete
Graph membership parity or Copilot model access. No model request was initiated.
The earlier unperformed-live-check statements below describe the initial
verification snapshot.

### Chat diagnosis — 2026-10-27

The configured fine-grained GitHub token was accepted by GitHub's user endpoint,
but the production slim image had no system CA bundle or certificate directory.
A native SDK session using the same token reported a TLS trust-root failure.
An isolated check using trusted public roots authenticated successfully with the
existing client-level explicit token; no session-token fallback or ambient login
was needed.

The image now installs `ca-certificates` in its shared build/runtime base and
asserts that the bundle exists. TLS verification remains enabled. Chat failures
also record an application-owned execution phase, never raw provider messages,
prompts, or credentials.

After the TLS correction, a real tool-free classification succeeded but the
conversation was blocked by the exact inventory check: the runtime excluded
`read_azure_detail` because its JSON schema had a discriminated union at the root
rather than an object. The tool now wraps the typed reference in an object.
The inventory check remains fail-closed. Native tests use this exact production
schema on create/resume and dispatch both reference variants without network
access; fake-provider tests validate the adapter arguments and redacted failure
phases. Existing user conversation content is retained.

Verification after both fixes: typecheck, lint, formatting, all 51 tests, and
the production Docker build pass. An actual request through the application
completed classification, exact tool-inventory validation, and streamed model
response with the expected synthetic marker. A second request sent from the
browser resumed the saved SDK session, completed successfully, and remained
visible after page reload. Neither request invoked tools or changed todos.
These are real authenticated model turns, not fake-provider results; the
synthetic diagnostic messages are retained in the visible conversation.

### Frontend refinements — 2026-10-27

The user requested removal of PR display filters, Enter-to-submit for chat/todos,
colored repository and board legends, and independent scrolling inside the app.
After clarification, board labels represent the PAT user's team-board **area
scopes**, including every overlapping match, not exact board/type/column or
iteration visibility. This is recorded in
[ADR-0012](../adr/0012-informational-legends-and-team-scopes.md).

Verification:
- Typecheck, zero-warning lint, formatting, all **61 tests**, and production
  Docker build pass. Team tests cover complete pagination, case-insensitive
  descendant/path-boundary matching, overlapping scopes, old-cache compatibility,
  independent cache persistence, denied access, invalid metadata, and failure
  isolation. Core work/PR snapshots refresh before annotation requests.
- All **18 Chromium cases** pass as one suite against the final production image
  on an isolated, token-free temporary-data instance. Keyboard cases cover
  desktop/drawer Enter, Shift+Enter, IME composition, repeated keydown, pending
  runs, blocked cleanup, and exactly-once todo creation.
- Browser cases verify informational legends without filter inputs, matching
  dot/edge colors, multiple/unmatched/unknown/stale board mappings, and genuinely
  independent main/chat scrolling without document scrolling at 375/768/1440px.
  Chat keyboard requests use an intercepted NDJSON response, not additional
  provider calls. The real user's data is not used by the mutating test suite.
- Desktop synthetic cards and legends were visually inspected in the browser;
  the clickdummy remains unchanged.
- The running app was updated and remains healthy. Full todo-list and transcript
  fingerprints match before/after replacement. No existing records were changed.
- The real app PAT successfully loaded the account's team scopes and full area
  rules. All assigned work items in the observed snapshot have area metadata
  and match a retrieved team scope. Core ADO scopes and team metadata are fresh
  without errors. Live browser legends match the configured metadata and have
  no repository filter inputs.

These observations establish the current account's area-scope annotations, not
universal board visibility or complete directory-backed PR group parity.

### Tabbed Azure DevOps views — 2026-10-27

The user's next refinement replaces the three DevOps cards with one panel and
three tabs: assigned work, review requests, and own PRs. Every tab has a count
bubble, including zero. Counts come from all cached rows in that dataset; a
failed refresh retains last-good counts with an explicit stale indicator.
Work-item/board accents use warm gold/coral colors; PR/repository accents use a
separate cool violet/teal/blue palette.

Verification:
- Production Docker build, strict types, zero-warning lint, formatting, and all
  61 unit/adapter/native tests pass.
- All **21 Chromium cases** pass on the final isolated production image,
  including populated/zero counts, independent dataset selection, retained tab
  selection during cache updates, and disjoint board/repository colors.
- Tab semantics, a single keyboard tab stop, Left/Right wrapping, Home/End,
  panel focus, and no mutations or additional reads when switching are verified
  at 375/768/1440px. All prior Enter, IME, dialog, todo, and independent-scroll
  checks remain green. Screen-reader-only count/status text is contained inside
  its tab button so it cannot create document overflow.
- The running app is updated and healthy; todo-list and transcript fingerprints
  match immediately before/after replacement. No active chat was interrupted.
- The live browser shows one visible panel and populated count bubbles for the
  cached assigned-work, review-request, and own-PR datasets. Tab-bar appearance,
  colored bubbles, and separate warm board/cool repository colors were checked
  directly without modifying user records.

### Team-dot contrast — 2026-10-27

The two initial team colors now use bright gold (`#ffd166`) and strong red
(`#dc2626`) instead of similar pastel tones. PR colors are unchanged. The focused
populated-browser case checks at least 3:1 contrast between the team dots and
against both sidebar and panel surfaces, while retaining matching row markers.
It passes on the isolated production image; all 61 release tests, type/lint/
format checks, and build also pass. Live Chromium measured **3.35:1** between
the team dots. The app is healthy and todo/chat fingerprints are unchanged.

### Readability, module boundaries, and public documentation — 2026-10-27

The workspace composition now lives in a 139-line dashboard entry point, with
separate todo, chat, DevOps-tab, legend, modal, and confirmation components.
A single controller retains polling, mutation locks, retry identities, and
stream cancellation. Shared contracts are grouped by domain behind their
existing facade. REST transport/retries, SDK policy, and NDJSON responses have
focused server modules; existing contract/policy import paths remain valid.

Verification:
- Production Docker checks pass: strict types, zero-warning ESLint, formatting,
  all **78 tests across seven files**, and the Next.js build. No database is
  created during compilation.
- The 17 added boundary cases cover authenticated REST/version handling, bounded
  retries, Retry-After/cancellation/error behavior, and chat stream heartbeats,
  completion, rejected starts, and disconnect propagation.
- All **21 Chromium cases** pass on the isolated, token-free production image.
  Existing todo, Enter/IME, modal focus, reduced-motion, responsive, tab/count,
  legend/contrast, and independent-scroll behavior remains verified.
- A TypeScript-symbol audit resolves re-export aliases and finds JSDoc on all
  **92 exported application declarations and 23 public class members**.
  Comments describe contracts, persistence, lifecycle, constraints, and failures;
  internal comments remain limited to non-obvious intent.
- The running app is updated and healthy. No chat or deletion approval was active
  at replacement; complete todo and transcript fingerprints are unchanged.
  Live Chromium reports three tabs, one visible panel, populated dataset counts,
  and zero page errors.
- All real ADO datasets and the team-board mapping have successful timestamps
  after this deployment, with no stale/error state. No live model prompt was sent
  for this refactor; existing native/fake-provider tests cover the moved SDK policy.

No database migration, dependency, credential, allowlist, or wire-shape change
was introduced. The [code conventions](../code-style.md) and
[module ownership](../architecture.md#3-module-ownership) document the new layout
and enforced readability rules.

### Assistant Markdown and todo drag handles — 2026-10-27

Assistant replies now render CommonMark/GFM, including streamed partial text,
headings, lists, task lists, quotes, code, and tables. User/tool content stays
literal. Raw HTML is skipped, images/embeds never load, and only exact known
HTTPS ADO source URLs become links. Original Markdown remains the stored content.

Open todos now have visible 44px drag handles using dnd-kit pointer/keyboard
sensors. Mouse and touch gestures preview placement; Space/arrows/Escape and
Up/Down buttons provide keyboard alternatives. Completed rows have no handle.
Drops use the existing revision-checked, idempotent ordering mutation; pending
writes disable controls and conflicts retain the committed order with an error.
See [ADR-0013](../adr/0013-safe-markdown-and-todo-drag-handles.md).

Verification:
- Final production image passes type/lint/format checks, all **78 tests**, and
  the Next.js build without initializing a build-time database.
- All **27 Chromium cases** pass together against a fresh isolated, token-free
  production instance. Six new cases verify safe GFM at 375/1440px, partial
  streaming/reload, keyboard pickup/drop/cancel, narrow-screen touch dragging,
  pending controls, conflict feedback, and successful retry.
- The pointer workflow now uses actual mouse movement on the handle and checks
  persisted order after reload. Keyboard tests await pickup/collision targets,
  rather than dropping before asynchronous drag transitions complete.
  Touch coverage dispatches Chromium touch events, not synthetic HTML drag events.
- Markdown checks assert semantic formatting, code/table containment, literal
  user/tool content, allowed/blocked links, no image/embed requests or script
  execution, and no document overflow at desktop/mobile sizes.
- The live app is updated and healthy; no active chat or pending deletion
  approval was interrupted. Full todo/chat fingerprints are unchanged.
  Live Chromium finds handles on open todos, the existing assistant
  reply rendered as Markdown, and zero page errors. ADO cache scopes are fresh.
- No live model prompt was sent and no user todo was reordered for acceptance.
  Mutating browser tests ran only against the isolated database.

### Compact handles and vertical-only dragging — 2026-10-27

The user refined the initial drag-handle design: the button is now borderless
and transparent, including on hover, with a 33px square target instead of 44px.
Its icon is 12x18px instead of 16x24px: both are 75% of their original dimensions.
Keyboard focus styling is retained. An application-local dnd-kit modifier
preserves the drag transform except for fixing X translation to zero; no new
dependency or persistence behavior is introduced.

Verification:
- Production type/lint/format checks, all 78 tests, and the Next.js build pass.
- All **12 focused Chromium cases** pass on the isolated production image:
  pointer/touch/keyboard ordering, cancellation, conflict recovery, responsive
  layout, and independent scrolling.
- Two new cases measure the 33px dimensions, zero-width borders, transparent
  hover, smaller icon, and zero rendered X translation during diagonal dragging
  at 375/1440px. They also verify positive Y movement and persisted drop order.
  The touch case now moves diagonally and independently checks zero X translation.
- The preceding 27-case full browser release remains recorded above; the suite
  now defines 29 cases, with this change validated by the focused 12-case run.
- The live app is updated and healthy. Live Chromium confirms all open
  todo handles have the new dimensions and borderless styling, with zero page
  errors. Full todo/chat fingerprints are unchanged; no active chat or pending
  deletion approval was interrupted.

### In-tab scope chips and compact tool outcomes — 2026-10-27

The three counted ADO tabs now provide single-select, colored team/repository
chips inside their bodies. First-chip defaults and independent per-tab choices
are local presentation; complete dataset counts, provider queries, todo-reference
choices, and chat context remain unchanged. Overlapping teams retain every
match. Nonempty no-team, unknown-assignment, and unknown-repository fallbacks
keep unclassified rows reachable. Last-good positive team matches survive stale
metadata, but stale nonmatches cannot assert no team.

Tool messages are native collapsed disclosures with 32px one-line summaries.
They identify the action and distinguish unsuccessful outcomes from complete
transcript status, plus pending deletion approval and unstructured legacy text.
Complete literal payloads and local timestamps remain expandable, not Markdown.
See [ADR-0014](../adr/0014-local-scope-chips-and-tool-outcomes.md).

Verification:
- Production type/lint/format checks, all **98 tests across nine files**, and
  the Next.js build pass without initializing a build-time database.
- **20 new unit tests** cover overlapping/path-boundary/project matching, missing,
  failed/stale/empty metadata, repository groups, zero counts, unknown fallbacks,
  unexpected cached row kinds, successful/failed/pending-approval summaries,
  literal HTML, prototype-like unknown tool names, and legacy raw content.
- All **17 focused Chromium cases** pass together on the isolated, token-free
  production instance. This is not a new full 31-case suite run.
- Populated-tab acceptance checks default/single pressed chips, group counts,
  overlapping teams, keyboard activation, separate unmatched/unknown access,
  empty known repositories, per-tab choice retention, cache refresh, disappeared
  selection fallback, full tab totals, unchanged reads/no mutations during chip
  selection, consistent colors, and chip containment at 375/1440px.
- Tool acceptance measures exactly 32px while collapsed at 375/1440px; Enter and
  Space expand/collapse, full payload/timestamp stay available, long content
  stays within chat, and errors remain visible despite complete message status.
- Related safe Markdown/streaming, three-width tab keyboard/cache updates,
  reduced-motion layout, independent scrolling, and Enter/IME chat guards pass.
- The initial populated-tab run exposed a test locator assuming a project
  prefix on repository labels. It was corrected to the existing repository-only
  legend label; the populated test and coherent 17-case run then pass.
- No live model prompt or user-data mutation is used for visual acceptance.
- The final image is deployed and healthy with ADO/Copilot configured. Complete
  todo/chat fingerprints match before/after replacement; the deployment guard
  found no active chat, pending cleanup, or deletion approval to interrupt.
- Read-only live Chromium checks pass at 375/1440px with zero page errors or
  mutations. The live tabs expose configured scope chips, default first selection
  and per-tab retention work, selected chip counts match rendered rows, and
  existing tool outcomes are collapsed 32px lines with expandable literal details.
  Both owned isolated acceptance containers are stopped.

## 1. Verified results

Environment: Linux x86_64, Node.js 24.22.1/npm 11.19.1 in Docker, Next.js 16.4.3,
Copilot SDK 1.0.26 with bundled runtime, Playwright/Chromium 1.64.1.
The root lockfile is authoritative; exact stack rationale is in the
[historical G0 report](g0.md).

| Check | Result and limits |
| --- | --- |
| Strict TypeScript | Pass for owned source, routes, tests, and UI |
| ESLint | Pass, zero warnings |
| Prettier | Pass for configured source/configuration files |
| Vitest | 98 tests across nine files pass: server/domain/transport/configuration, local grouping/tool summaries, and one actual native-runtime case |
| Production build | Pass in the actual Dockerfile; build-time database path remains absent |
| Non-root image | Pass; server runs as `node`, SQLite migrations/writes and packaged SDK native process work |
| Chromium | Latest 17-case focused scope/chat/layout run passes; preceding full 27-case release and 12-case focused handle/vertical-axis run are recorded above, not a new full 31-case certification |
| Responsive/keyboard UX | 375/768/1440px, no horizontal overflow, reduced motion, mobile chat drawer, Escape/focus return, pointer and keyboard reorder pass |
| Visual review | Desktop synthetic dashboard and live counted tab bar inspected; clickdummy remains unchanged |
| Reference validation | Scoped URLs, organization identity, malformed encoding, zero/unsafe numeric IDs, offline retention, and cross-organization cache separation tested |
| Disabled/degraded integrations | Missing tokens leave health ready and todos usable; invalid ADO settings leave local writes usable; stored chat remains readable after removing the Copilot token |
| Production error boundary | Expected errors retain safe status/message across separately compiled Next.js server entry bundles; unmarked upstream errors remain redacted |
| Container replacement | Ten acknowledged synthetic todos, order, revisions, references, and list revision survive replacement; SHA-256 of the complete todo-list representation matches |
| Whole-volume restore | Stopped-volume archive restored into a fresh owned volume; ten synthetic records and complete todo-list fingerprint match exactly |
| Awaited shutdown | Normal shutdown and shutdown with an actual `copilot-runtime` child log `application.stopped`, exit 143 on SIGTERM, no OOM/forced-kill exit |
| Real app SDK lifecycle | With a deliberately invalid synthetic token and network disabled, the app starts a native SDK child, reports the failed provider request safely, and retains the transcript after replacement |
| Real app offline clearing | After removing that synthetic token, confirmed clearing returns 200, removes app messages, reports no pending SDK cleanup, and leaves todos byte-for-byte unchanged |
| Compose | Actual persistent app started healthy; `127.0.0.1:3000` only, non-root, separate user data volume, runtime-only ignored token file, system CA roots for native HTTPS |
| Live chat | Actual classifier and streamed model response through the API and browser pass; existing SDK conversation is resumed, answer survives page reload, and todos are unchanged |

The invalid-token run is not successful Copilot authentication or an actual
model response. The native policy test performs no model calls. Successful
local readiness does not imply valid upstream permissions or account/model
availability.

## 2. Requirement-to-evidence map

These are grouped coverage pointers, not an assertion that every clause is
fully certified.

| Requirement area | Executable evidence | Remaining limits |
| --- | --- | --- |
| TODO-001–008, TODO-010–011 | [Todo tests](../../src/server/todos.test.ts), real browser workflow/conflicts/order, container replacement and restore | Native DB failure is covered with an injected transaction failure, not physical disk/power-loss certification |
| TODO-009 | [ADO tests](../../src/server/azure.test.ts), shared typed organization/project/repository identity, browser unverified/unavailable references | Actual accessible/deleted/forbidden object checks require the app PAT |
| ADO-001–002 | Real scoped REST adapter, configuration isolation and fake transport | Actual PAT identity, scope permissions, multiple real projects, repository access, and optional email assertion are not live-certified |
| ADO-003–005, ADO-008, UX-005 | Fake ADO contract tests and populated Chromium cards, including custom/terminal work, PR metadata/votes, stale data, informational legends and team scopes; real team/area metadata sync passes | Browser card scenarios are synthetic; area scopes do not certify exact board visibility |
| ADO-004, ADO-012 | Seven approval combinations, unknown group votes, nested/cyclic Graph traversal fixture, Graph-denied scope isolation | Complete directory-backed membership and reviewer mapping require parity checks with the real account |
| ADO-006–007, ADO-009–011 | Single-owner lifecycle implementation; fake refresh/cache/paging/failure tests; historical hosting proof; scoped timestamps and state rendering | A live long-running poll, throttling headers, and all actual endpoint pagination variants remain operational checks |
| AI-001–006 | Real SDK adapter, fake-provider orchestration/intent/read/clarify tests, native tool policy and resume | Authentication, model availability, classification accuracy, real conversation continuation, and provider retry IDs remain live checks |
| AI-007–011 | Shared todo domain, exact/expired/rejected approvals, invocation/deadline guards, late-callback rejection, cancellation preserving committed writes | Native invalid-token lifecycle does not certify cancellation during a successful model turn |
| AI-012–013 | Native create/resume inventory, blocked shell/removed mutation tool, physical named-session deletion; fake failed-clear/retry tests; real app offline clear | No OS sandbox claim; full real conversation cleanup/restore parity remains live acceptance |
| UX-001–004, UX-006–008 | Real browser workflows, validation input retained at 501 characters, explicit states, English UI, drawer, keyboard/focus/reduced motion, desktop visual review | Browser automation is not a complete assistive-technology accessibility audit |
| OPS-001–005, OPS-007–010 | Actual image/build/Compose, HTTP boundary tests, safe external-text rendering, durable SQLite and backup/restore, documented setup/upgrade | Provider-side retention and account-specific recovery are not locally certified; no formal external security audit |
| OPS-006 | Deferred by explicit prior user decision | Not a release gate |

Important source regressions discovered and fixed during acceptance:
- Cross-entry `AppError` recognition uses a process-wide symbol brand instead of
  constructor identity, without trusting arbitrary upstream `code`/`status`.
- Creation input remains focusable while pending; oversized titles are rejected,
  not silently truncated by an HTML `maxlength`.
- Already-open state updates do not append/move the todo; already-completed
  updates retain their original completion time.
- Reference URLs retain their original organization after configuration changes;
  snapshot keys include organization.
- Retry delay uses abort-aware timer cleanup; malformed URL encoding/numeric IDs
  become explicit validation failures.
- The browser reports a prematurely closed chat stream instead of assuming a
  completed response.

## 3. Reproduce local checks

The production Dockerfile installs the lockfile with scripts disabled and runs
typecheck, lint, Vitest, formatting, production build, and the no-build-database
assertion:

```sh
docker build -t devdesk:local .
```

With Node.js 24 available:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
```

For browser checks, start an **isolated** instance with a dedicated volume and
no real tokens. Never run the mutating browser suite against normal user data.
The verified image pair is:

```text
node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
mcr.microsoft.com/playwright:v1.64.1-noble@sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea
```

In the verified Docker environment, the browser shared the owned app container's
network namespace and used `http://127.0.0.1:3000`. The temporary app had no
external network. The normal Compose instance is separate.

The backup/restore check used the production image's `tar`, a stopped source
volume, and a fresh destination volume. Complete todo-list hashes before and
after matched. A real conversation and account-dependent resume were not part
of that archive.

## 4. Account-specific acceptance status

No real tokens were requested in chat, extracted from MCP, or borrowed from host
logins. Locally configured tokens were used for the follow-up checks above.
The remaining checks below are **not performed**, not failed and not waived:

1. **ADO authentication and scope:** initial and subsequent scheduled syncs for
   the configured scopes pass. Manual parity with ADO, additional projects,
   optional email assertion, and live denied-scope recovery remain unverified.
2. **Review parity:** compare representative personal, group-only, mixed,
   nested, and directory-backed requests with Azure DevOps. Verify positive
   votes 5/10 and identity mapping. Do not treat an unverified directory-backed
   review inbox as certified complete. Missing/unsupported memberships must be
   resolved explicitly before claiming full baseline acceptance.
3. **Copilot access:** basic authentication, structured classification, streamed
   answers, browser sending, and same-process SDK resume pass with the configured
   account/model. Real model-driven tool use and quota/policy failures remain
   unverified. The default `gpt-4.1` model is explicit, not a promise of every
   account's entitlement.
4. **Intent and actions:** exercise a representative/adversarial request corpus,
   explicit create/edit/reopen/order, ambiguous targets, suggestions-only
   messages, and external discussions containing instructions. Check observed
   classification separately from hard tool/deletion boundaries.
5. **Conversation recovery:** continue an actual conversation after container
   replacement and after stopped whole-volume restore. Verify the same SDK
   conversation and usable context, not just the SQLite transcript.
6. **Cancellation and clearing:** cancel/disconnect during actual streaming and
   tool work; confirm committed writes remain and later callbacks cannot mutate.
   Clear a real conversation, verify no app/SDK session remains, and exercise a
   retryable cleanup failure without claiming forensic/provider-side erasure.

These checks are integrated operational acceptance, not another prerequisite
experimental phase. The application is already locally usable; setup,
recreation, safe backup/restore, and troubleshooting are in the
[README](../../README.md).
