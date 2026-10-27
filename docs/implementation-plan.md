# Implementation Plan

Status: baseline v1 approved; P0 complete on 2026-10-26.
The user subsequently lifted the up-front G0 blocker and explicitly authorized
delivery of the complete application with token-only setup; see
[ADR-0011](adr/0011-integrated-delivery-and-verification.md).
The root app now implements M1-M3. Production/browser verification and operational
documentation are tracked in the [application report](verification/application.md).
Live account-specific checks remain explicit and do not block local use.

## Current review state

- Confirmed: todo refinements, automatic AI intent classification and its residual
  risk, one clearable chat, run limits, polling rules, all work-item states, and
  inclusion of team/group review requests.
- Confirmed frontend: the [clickdummy](../clickdummy.html) is the visual baseline;
  one dashboard and narrow-screen chat drawer, not all prototype interactions.
- Confirmed Azure DevOps scope: Utilities initially, network-locator and Utilities
  in an explicit repository allowlist; project-wide assigned work items; PR-only
  repository filters; group-only requests satisfied by all relevant groups'
  approval unless a personal request remains open.
- Completed evidence: read-only repository/team metadata and team settings.
  No work-item content, PR discussions, or code was retrieved.
- Confirmed remaining rules: English UI, UTC/local timestamp display, manual
  retention, isolated integration configuration errors, concurrency/retry
  contracts, and UI/operational quality gates.
- Deferred: performance thresholds, benchmark fixtures, and reference-hardware
  certification. They do not gate P0, G0, or the MVP.
- Verified in isolated G0 probes: exact dependency compatibility, production
  lifecycle, native packaging, browser integration, and offline SDK tool/session
  behavior. ADR-0004 is accepted for the tested single-replica Node hosting mode.
- Open technical evidence: real Copilot authentication and intent/retry/recovery
  behavior, plus app-scoped ADO permissions and complete Graph/reviewer mapping.

## Gate P0 — Approve the concept

Status: complete; explicitly approved by the user on 2026-10-26.

Approved:
- [MVP scope and active acceptance contracts](requirements/REQUIREMENTS.md).
- Todo, assistant, Azure DevOps, frontend, code-style, and operational rules.
- Local-first configuration/error behavior and release quality checks.
- Deferral of OPS-006 performance benchmarking.

This freezes the concept, not a claim of implementation feasibility. ADR-0004 was
subsequently accepted on the recorded G0 production lifecycle evidence. Exact technical
encodings and algorithms may be refined in G0 without changing approved behavior;
behavior/scope changes require review and an appropriate new decision.

## Gate G0 — Verify compatibility and high-risk assumptions

Prerequisite: P0 and explicit approval to start technical experiments.

Status: separately authorized and partially verified on 2026-10-26. Offline
compatibility/lifecycle evidence is recorded; live integration and AI policy
checks remain open. **G0 has not passed, but is no longer an implementation
prerequisite.** ADR-0011 supersedes that sequencing rule, not the requirements.
Remaining live verification belongs to feature/operational acceptance.

Use minimal, disposable experiments and approved synthetic integration data.

| Experiment | Required evidence | Related requirements |
| --- | --- | --- |
| Exact dependency set | Node 24, Next.js/React, Tailwind/Motion, Drizzle/better-sqlite3, SDK, Vitest/Playwright install and build together; record versions and lockfile | OPS-009 |
| Production lifecycle | Exactly one coordinator, polling with no browser open, coalesced manual refresh, clean shutdown, no build-time side effects | ADO-006, ADO-007, OPS-004 |
| Native/container packaging | SQLite driver and SDK runtime start in the actual non-root production image | OPS-001, OPS-004 |
| SDK authentication/isolation | Explicit token works; no ambient auth fallback; only allowed tools exist on create and resume; runtime cannot obtain the ADO PAT | AI-001, AI-008, AI-012 |
| AI write-intent policy | Evaluate representative/adversarial classification cases; read/clarify decisions expose no writes; incorrect intent never bypasses hard capability/deletion limits | AI-006, AI-009, AI-011 |
| SDK persistence/cleanup | Continue after container restart; callback IDs support retry safety; clear removes both visible and SDK session state | TODO-011, AI-002, AI-013 |
| ADO contract | Resolve PAT identity and selected repo UUIDs; verify Graph read scopes, nested membership/identity mapping, positive group votes, directory limitations, paging, and forbidden access behavior | ADO-001, ADO-002, ADO-004, ADO-009, ADO-012 |
| Configuration isolation | Invalid ADO/Copilot config blocks only that integration; local writes and stored-chat reads remain usable; invalid core storage blocks writable startup | OPS-003, OPS-005 |

Exit: evidence is recorded, incompatible assumptions are corrected through ADRs,
and no critical capability depends on an untested SDK/Next.js behavior.

If an experiment fails, revise the design rather than silently add another
service, weaken AI permissions, or replace persistent state with a browser cache.

## M1 — Local application and persistent todos

Prerequisite: P0 and the explicit implementation authorization in ADR-0011.

Status: implemented; production todo/browser/restart results are recorded in the
[application report](verification/application.md).

Deliver:
- npm project, quality commands, production Compose packaging, config validation.
- Migrations, todo service, revisions, mutation receipts, and local readiness.
- Todo UI with completion/reopen, ordering, validation, and confirmation.
- Dark responsive shell using Tailwind and reduced-motion-aware Framer Motion,
  following the [frontend baseline](frontend-concept.md).

Acceptance: TODO-001 through TODO-008, TODO-010, TODO-011; UX-001 through UX-004,
UX-006 through UX-008; OPS-001 through OPS-004, OPS-007, and OPS-010.
Restart, concurrent-tab writes, failed persistence, and keyboard reorder must pass.

## M2 — Azure DevOps dashboard and references

Prerequisite: M1.

Status: implemented with real REST calls, scoped last-good snapshots, polling,
reference checks, and offline contract tests. Real PAT and directory-backed
group parity remain account-specific acceptance.

Deliver:
- Scoped read-only adapter and user/team/group identity resolution.
- Explicit repository allowlist with no auto-inclusion; project-wide work items
  and PR-only repository display filters.
- Persistent snapshot cache, one coordinator, freshness/error states.
- Three compact views, manual refresh, safe source links, todo associations.
- On-demand work-item and PR discussion reads for later assistant tools.

Acceptance: ADO-001 through ADO-012, TODO-009, UX-005, OPS-005.
Test multi-page data, empty successes, throttling, mixed-scope failures,
stale-cache startup, and the personal/group approval cases in the
[Azure DevOps concept](azure-devops-concept.md). No Azure DevOps writes are available.

## M3 — Bounded Copilot assistant

Prerequisite: M2.

Status: implemented with the real SDK, durable transcript/session ownership,
bounded execution, and UI-owned deletion approval. Native policy tests and
fake-provider orchestration tests are separate from unperformed live model turns.

Deliver:
- Dedicated managed runtime, explicit authentication, automatic intent
  classification, and per-turn tool permissions without a user mode switch.
- Durable transcript, streaming status, cancellation, and restart/resume.
- Shared-service direct todo writes and server-owned exact deletion approvals.
- Data-transfer disclosure and complete local conversation clearing.

Acceptance: AI-001 through AI-013, with TODO-010/TODO-011 exercised through AI too.
Adversarial external comments, unknown tools, ambiguous IDs, disconnect after
commit, expired approval, interrupted resume, and failed cleanup are mandatory
cases.

## M4 — Operational acceptance and release

Prerequisite: M3.

Status: deployment, token setup, backup/restore, and verification are documented
for the actual application. Complete baseline certification still requires the
account-specific checks listed in the application report.

Deliver:
- Fresh-install and upgrade instructions, backup/restore runbook, secret-handling
  guidance, and known integration limitations.
- Complete requirement-to-test mapping with results.

Acceptance: all active requirements, especially OPS-008, OPS-009, and OPS-010.
OPS-006 is deferred; no performance benchmark or reference fixture is required.

## Definition of done

- Every MVP requirement has an automated acceptance test or a documented,
  reproducible manual check with a result.
- Deferred OPS-006 is not counted as an unfulfilled MVP requirement.
- Typecheck, ESLint, Prettier, Vitest, Playwright, and production build pass.
- Clean Compose startup and upgrade preserve data; restore verifies chat resume.
- No credentials, private content, databases, or runtime state are committed.
- Local todos work during both upstream outages.
- Confirmed deletion cannot be bypassed by model text, replay, or stale approvals.
- Known limitations and any intentionally deferred behavior are visible in docs.
- Documentation describes the implemented version; unverified assumptions are not
  relabelled as completed work.
