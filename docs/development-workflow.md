# Feature Delivery Workflow

Status: Approved for this repository on 2026-11-03.

This is the authoritative workflow for planning, documenting, implementing, and
verifying changes. Agent instructions, the feature-workflow skill, and the
Feature Planner reference it rather than maintaining separate policies.
Documentation is in English; conversation follows the user's language.

## 1. Classify the Change

Use the full workflow for new features and relevant changes to user-visible
behavior, public contracts, architecture, persistence, authorization, or external
integration boundaries.

Small bug fixes that restore an existing contract, behavior-preserving
refactors, and editorial changes use a short check:

- Identify the existing contract and confirm that the change preserves it.
- Make the smallest appropriate change and run focused checks where applicable.
- Correct affected documentation without creating unnecessary requirements or
  ADRs. Report the result and any verification gaps.

Classify by impact, not line count. If a fix changes the agreed contract, use the
full workflow. Ask a focused question when the distinction affects scope or
approval and cannot be resolved from nearby evidence. Workflow maintenance does
not recursively require new feature requirements or an ADR.

## 2. Clarify the Concept

Read the relevant existing requirements, ADRs, and nearby implementation or tests.
Do not map the whole repository or treat the current implementation as the
authority for desired behavior.

Discuss the goal, scope, non-goals, user-visible behavior, constraints, failure
cases, acceptance criteria, and decisions requiring alternatives. Distinguish
confirmed facts, proposals, and open questions. Make acceptance criteria
observable and identify a proportionate way to check them.

Present the proposed concept and resolve blocking questions. Do not edit feature
requirements or ADRs, or start implementation, during this discussion.

## 3. Approve the Concept

Ask the user to approve the concrete concept before documenting it. Approval
must be explicit and refer to an identifiable scope. For example:

> The concept is approved. Document the requirements and relevant decisions.

This approval authorizes documentation and preparation of an implementation
plan, not application changes. A planning request, silence, or an agent's own
recommendation is not approval.

## 4. Document Requirements and Decisions

- Update the relevant [requirements](requirements/REQUIREMENTS.md), reusing
  domain files and their ID conventions. Add a domain file only when needed.
  Include acceptance criteria, non-goals, and consequential failure behavior.
- Assess ADR need explicitly. Add an ADR for a consequential decision with
  meaningful alternatives or tradeoffs, not merely because a feature exists.
  Explain briefly when existing decisions are sufficient.
- Follow the [ADR register and status policy](adr/README.md). Use the next
  available number, link the requirements, and include context, decision,
  alternatives, consequences, and verification links. Do not mark an unapproved
  decision accepted.
- Preserve accepted historical decisions. Record changed direction in a new
  ADR with explicit supersession boundaries, update the register, and keep
  current requirements accurate.
- Record the approval date, agreed scope, and approval stage concisely in the
  relevant documentation. Do not copy entire conversations or claim tests passed
  because the concept was approved.

Prepare a concise implementation plan covering affected boundaries, work order,
focused checks, and any live-account or manual acceptance prerequisites. Keep
small plans in the handoff or relevant feature documentation; create a separate
plan only when its size warrants one. Do not overwrite unrelated historical
plans. Requirements, decisions, planned checks, and later evidence should link
to one another without duplicating entire documents.

## 5. Approve Implementation

Present the written artifacts, implementation plan, remaining uncertainties, and
proposed checks. Ask for separate, explicit implementation approval. For example:

> The documented scope and plan are approved. Implement them now.

Before this approval, do not change application code, dependencies, runtime
configuration, migrations, or tests. Existing feature approvals and accepted
ADRs, including historical delivery authorizations, are not blanket permission
for a new increment. Documentation approval is not verification evidence.

The Feature Planner stops here. The user switches to an implementation-capable
agent and explicitly submits the implementation request.

## 6. Implement and Verify

Implement only the approved scope using repository conventions. Run focused
checks tied to acceptance criteria and applicable repository gates. Verify each
meaningful change before expanding to the next affected area.

Maintain implementation and verification status separately from approval. Record
actual evidence, failures, unperformed checks, and environment limitations in
the relevant documentation, following the existing
[application verification report](verification/application.md) where applicable.
Do not infer live integration success from fixtures or offline tests.

Close out with the delivered scope, check results, and remaining acceptance
gaps. Do not mark untested requirements verified or hide failures.

## Scope Changes and Resuming Work

Material changes to behavior, acceptance criteria, architecture, data access,
destructive operations, or agreed non-goals return to concept discussion and
approval. Update the documentation and obtain renewed implementation approval
before implementing the changed scope. Routine implementation details within
the approved boundaries do not need another gate.

When resuming, identify the latest agreed scope, documented status, approval
evidence, and next permitted action. If approval cannot be established from the
available conversation or explicit approval record, ask rather than infer it
from an Accepted status or existing code.

## Using the Agent and Skill

- Select **Feature Planner** in the VS Code chat agent picker for interactive
  planning and documentation. Start with a request such as: "Plan project groups
  for todos; do not implement yet."
- Approve the concept when ready, then review the resulting documentation and
  plan. Switch to the normal implementation agent only when ready to authorize
  implementation.
- Where VS Code supports handoffs, **Review Implementation Request** switches to
  the normal agent with a prepared prompt. It does not send the prompt or grant
  approval; review and submit it explicitly. Manual switching is the fallback.
- The normal agent follows the same workflow. The **feature-workflow** skill can
  be invoked with `/feature-workflow` where skill slash commands are supported;
  applicable tasks should also trigger it automatically through its description
  and the repository instructions.

The planner has read, search, and edit tools but no terminal or delegation tools.
Its documentation-only edits and approval gates are behavioral instructions;
general edit tools do not enforce a path allowlist. Hooks or CI enforcement are
not part of this setup. Agent discovery and handoff availability depend on the
editor and selected agent harness.

## Workflow Acceptance Scenarios

| Scenario                                            | Expected behavior                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New feature without approval                        | Discuss and present the concept; no feature documentation or implementation edits yet. After concept approval, document and plan; stop before implementation approval. |
| Small bug fix restoring an existing contract        | Apply the short check, implement the focused fix, and verify it; no artificial requirements or ADR.                                                                    |
| Material scope change after implementation approval | Pause the changed work, clarify and reapprove the concept, update documents, and obtain renewed implementation approval.                                               |

These are behavior checks to exercise in an editor session, not a claim that
static file validation proves agent compliance.
