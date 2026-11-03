---
name: feature-workflow
description: 'Plan and deliver repository features with requirements, ADRs, acceptance criteria, and separate concept and implementation approvals. Use for new features, feature planning, relevant behavior or architecture changes, scope changes, and requests to write requirements or ADRs; also for Feature-Planung, Anforderungen, and Freigaben. Classify small fixes before applying the full workflow.'
user-invocable: true
disable-model-invocation: false
---

# Feature Workflow

Read the [development workflow](../../../docs/development-workflow.md) before
acting. It is the authoritative policy; follow its gates rather than treating
this skill as independent implementation permission.

## Procedure

1. Classify the request using the workflow's full-flow and short-check criteria.
   For a small contract-preserving change, use the short check and stop applying
   the full feature ceremony.
2. Read only the relevant requirements, ADRs, and nearby implementation evidence.
   Clarify scope, non-goals, acceptance criteria, risks, and open decisions with
   the user. Present the concept without editing feature documents or code.
3. Check for explicit concept approval for this scope. If absent, ask and wait.
4. Once approved, update existing requirements, assess ADR need, and document
   consequential decisions following the workflow and repository conventions.
   Prepare a proportionate implementation and verification plan.
5. Present the artifacts and ask for separate implementation approval. While
   planning or awaiting approval, do not change code, dependencies, runtime
   configuration, migrations, or tests. If running as Feature Planner, hand off
   instead of implementing, even when the user requests implementation.
6. Only an implementation-capable agent with explicit approval proceeds to
   implement and verify. Link actual evidence to the requirements and report
   gaps separately from approval and implementation status.
7. For material scope changes or resumed work, apply the workflow's reapproval
   and approval-evidence rules before proceeding.

## Stage Summary

At a gate or handoff, state the change classification, current stage, agreed
scope, unresolved questions, relevant artifact links, approval received or still
needed, and next permitted action. Keep this brief; do not create a tracking
file solely for the summary or manufacture approval evidence.
