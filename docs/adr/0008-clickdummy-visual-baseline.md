# ADR-0008: Clickdummy as Visual Baseline

Date: 2026-10-26  
Status: Accepted

## Context

The user supplied an interactive HTML clickdummy with a dark three-column
developer dashboard. Its visual hierarchy is useful, but its localStorage,
daily wording, immediate deletion, repo/work-item filtering, and canned chat
do not implement the reviewed product rules.

## Decision

Use the [clickdummy](../../clickdummy.html) as the frontend's layout and visual
direction, not a pixel-perfect or business-logic contract.

Keep one dashboard with a left context rail, prominent todos, compact DevOps
cards, and desktop chat on the right. Use a drawer for narrow-screen chat,
not the prototype's stacked placement. Do not add a separate Daily Todos page.

Adapt demo copy, storage, and interactions to the confirmed requirements.
Repository/board filter semantics are deferred until Azure DevOps exploration.

## Alternatives considered

- Inspiration only: less binding than the user's selected visual baseline.
- Pixel-perfect recreation: not selected; accessibility and responsive adaptation
  take precedence over exact dimensions or tiny metadata text.
- Copy the standalone HTML implementation: would contradict the selected stack
  and domain/persistence requirements.

## Consequences

- Keep the user-owned preview unchanged and document necessary departures.
- Translate visual tokens and hierarchy into Tailwind CSS and Framer Motion.
- Do not infer actual Azure DevOps topology or approved filter semantics from
  sample repository labels.
- Source inspection is complete; browser visual validation is not, because the
  integrated browser reported a trusted-folder restriction.
- Accessibility, truthful status, and confirmed business rules outrank demo
  details when they conflict.

## Verification

[Frontend concept](../frontend-concept.md),
[UX-001](../requirements/experience-and-operations.md#ux-001--dashboard-hierarchy),
[UX-003](../requirements/experience-and-operations.md#ux-003--keyboard-accessibility),
and [UX-004](../requirements/experience-and-operations.md#ux-004--motion).

## Follow-up — 2026-10-26

The filter decisions deferred above were subsequently resolved through scoped
metadata exploration and user review. [ADR-0009](0009-ado-scope-and-review-visibility.md)
records PR-only repository filters, project-wide work items, and the selected
repository allowlist. The original visual-baseline decision remains accepted.
