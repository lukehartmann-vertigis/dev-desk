# ADR-0004: In-Process Polling and Scoped Persistent Snapshots

Date: 2026-10-26  
Status: Accepted after G0 lifecycle verification on 2026-10-26

## Context

Azure DevOps data must refresh without an open browser, remain readable during
outages, and not incur duplicate polling when several tabs are open. The chosen
Next.js deployment must host long-lived server work reliably.

## Decision

Use one server-owned, non-overlapping polling coordinator in the single
production Next.js instance, initialized through its Node startup lifecycle.
Manual refresh coalesces with an active cycle.

Persist complete snapshots per dataset/project or dataset/repository scope.
Keep the last successful snapshot when a scope fails. Poll again after the
configured delay from cycle completion.

Default interval: 180 seconds. The browser reads local snapshots separately and
never owns upstream polling.

## Alternatives considered

- Browser-driven polling: stops with closed tabs and duplicates upstream traffic.
- External cron/worker container: clearer isolation, but adds an operational unit;
  reconsider only if G0 invalidates in-process lifecycle assumptions.
- Webhooks: require a reachable endpoint and more setup than local-only polling.
- Replace-all cache: a failed project could hide otherwise valid cached data.

## Consequences

- Exactly one app replica is supported.
- Production startup, worker behavior, shutdown, and no-build-side-effects need
  proof; a module singleton alone is not sufficient evidence.
- Complete paging/limits and atomic scope replacement are required.
- Polling values, freshness thresholds, and local UI refresh intervals have been
  confirmed in product review. Lifecycle evidence supports this decision for the
  tested hosting mode, not an untested serverless or multi-replica deployment.

## Acceptance condition

Accept only after P0 review and G0 demonstrates one coordinator, no overlapping
cycles, browser-independent updates, and clean shutdown in the selected Next.js
production hosting mode. Otherwise supersede this proposal before proceeding.

## Acceptance evidence — 2026-10-26

The [G0 report](../verification/g0.md#3-production-lifecycle-evidence) records
Next.js 16.4.3 production-build isolation, one non-root serving coordinator across
entry bundles/tabs/requests, browser-independent updates, coalesced concurrent
refreshes, SIGTERM shutdown markers, and SQLite continuity after container
replacement. This satisfies the proposal's lifecycle condition.

Acceptance is limited to one long-lived Node replica using regular `next start`.
Reverify after framework/packaging changes. Scoped cache replacement, complete
upstream paging, and interruption of real integration work remain implementation
and acceptance obligations; G0 overall is still incomplete.

## Verification

[ADO-006](../requirements/azure-devops.md#ado-006--periodic-synchronization)
through [ADO-010](../requirements/azure-devops.md#ado-010--recoverable-failures),
and [Next.js lifecycle](../architecture.md#7-nextjs-lifecycle).
