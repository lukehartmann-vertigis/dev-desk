# ADR-0010: Isolate Integration Configuration Failures

Date: 2026-10-26  
Status: Accepted

## Context

The initial design proposed failing application startup on partial or malformed
integration configuration. The user instead chose to keep the local workspace
usable when only Azure DevOps or Copilot is misconfigured.

Core persistence errors are different: accepting writes without a usable
database would violate the durable-storage contract.

## Decision

Validate core storage and each integration independently:
- Core storage or migration failure blocks normal writable operation.
- Entirely unconfigured integrations have an explicit disabled state.
- Partial/invalid integration settings produce a visible configuration-error
  state for that integration only.
- Valid configuration followed by expired credentials, denied access, or service
  failure produces an explicit runtime integration error.

Keep local todos and stored transcript reads usable whenever core persistence
is healthy. Do not silently repair credentials/configuration, substitute another
model, or pretend unavailable integration data is a successful empty response.

## Alternatives considered

- Fail startup for every integration config error: simpler globally, but rejected
  because it unnecessarily blocks local todos.
- Ignore invalid settings or use defaults silently: rejected because the user
  cannot diagnose the failure or trust the active scope.
- Allow writes after persistence failure: rejected because acknowledged changes
  could be lost.

## Consequences

- UI, health status, and redacted structured logs must distinguish disabled,
  configuration-error, runtime-error, and usable integration states.
- Integration config corrections can be applied through server configuration and
  restart without resetting local data.
- Local readiness depends on core storage, not either external service.
- Startup validation cannot be a single all-or-nothing parse that discards the
  entire application configuration when one integration is invalid.
- Baseline approval is a specification decision, not authorization to begin G0.

## Verification

[OPS-003](../requirements/experience-and-operations.md#ops-003--validated-configuration),
[OPS-004](../requirements/experience-and-operations.md#ops-004--durable-storage),
and [OPS-005](../requirements/experience-and-operations.md#ops-005--independence-from-upstream-availability).

Test each integration independently with absent, partial, malformed, expired,
and valid settings. Verify that local operations and the other healthy
integration remain available, while core persistence failure never receives a
success-shaped fallback.
