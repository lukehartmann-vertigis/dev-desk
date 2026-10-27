# ADR-0011: Deliver the Application and Integrate Remaining Verification

Date: 2026-10-26  
Status: Accepted by explicit user instruction

## Context

The approved concept originally made complete G0 verification a prerequisite for
feature implementation. Offline compatibility, native packaging, lifecycle, and
SDK policy/session checks passed, but live ADO and Copilot checks required
app-scoped credentials. The user postponed those checks, then explicitly asked
for a usable application rather than further experiments: lift the blocker and
deliver a state where only tokens need to be supplied.

## Decision

- Remove completion of G0 as the up-front prerequisite for M1.
- Implement the approved todo, ADO, and Copilot scope in the actual root app.
- Preserve the existing product contracts and hard permission boundaries.
- Supply the selected workspace defaults and a default model so only the two
  integration token values are required for the normal deployment.
- Keep local todos independently usable with absent or failed integrations.
- Verify actual source, production packaging, browser behavior, and persistence
  during delivery. Keep provider/account-dependent checks explicit.
- Retain the G0 report as historical evidence. It remains partial; this decision
  does not turn unperformed tests into passes or defer active product behavior.

## Alternatives considered

- Keep the original blocker and continue disposable probes: rejected by the user
  in favor of an application they can use.
- Ship only a todo prototype: rejected because the requested scope includes real
  ADO and Copilot adapters, not demo data.
- Claim complete live acceptance without credentials: rejected as unverifiable.
- Weaken tool policy, borrow host login, or ask for tokens in chat: rejected.

## Consequences

The deployment works without external credentials, with explicit disabled
integration states. After local token configuration and container recreation,
the adapters use the configured real accounts. Incorrect tokens, missing scopes,
model restrictions, and incomplete upstream data remain visible failures.

Account-specific live verification is operational acceptance, not a reason to
prevent implementation or local use. Full baseline certification still requires
evidence for those checks. Performance benchmarking remains deferred as before.
There are no new services, providers, authentication UIs, or scope changes.

## Verification

See the [application acceptance report](../verification/application.md),
[updated implementation plan](../implementation-plan.md), and
[start/backup instructions](../../README.md).
