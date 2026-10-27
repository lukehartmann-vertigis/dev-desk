# ADR-0013: Safe Assistant Markdown and Accessible Todo Drag Handles

Date: 2026-10-27  
Status: Accepted for the requested frontend enhancement

## Context

The user requests Markdown for agent messages and manual drag-and-drop ordering
of todos. Assistant output was literal text with scoped source links; ordering
already had a revision-checked server mutation, Up/Down buttons, and basic native
HTML dragging without a visible handle.

The existing content-safety, accessibility, reduced-motion, and persistence
contracts remain binding.

## Decision

- Use pinned `react-markdown` and `remark-gfm` for saved and partial streamed
  assistant text. Support headings, emphasis, lists/task lists, quotes, code,
  autolinks, and tables without building a custom Markdown parser.
- Skip raw HTML. Render image descriptions without image/iframe loading. Keep
  task checkboxes disabled; Markdown never dispatches application actions.
- Retain exact known HTTPS ADO source URLs from todo references/cached rows as
  the navigation allowlist. Other destinations render readable labels, not links.
  User messages and tool outcomes remain literal.
- Use pinned dnd-kit core/sortable/utilities with explicit 44px handles, pointer
  and keyboard sensors, placement feedback, announcements, and focus restoration.
  Only handles initiate dragging; ordinary text, links, and controls remain usable.
- Support touch via handle-local `touch-action: none`, not by disabling scrolling
  on the whole row. Keyboard support uses Space, arrows, and Escape; retain
  Up/Down buttons as an independent alternative.
- Commit only a completed drop through the existing todo reorder action.
  Cancelled/outside drops do not write. Pending/conflicting writes follow existing
  locking, retry-identity, revision, and error behavior. Completed rows have no handle.

## Alternatives

- Render HTML or use a permissive HTML plugin: unnecessary executable-content
  and remote-resource surface.
- Link all Markdown URLs or fetch remote images: broadens the existing source
  policy and allows unsolicited outbound requests.
- Extend native HTML dragging alone: does not provide equivalent touch and
  keyboard interaction.
- Write custom gesture/collision/keyboard logic: duplicates established sensor,
  scrolling, and accessibility behavior.

## Consequences

Five direct runtime dependencies are added and pinned in the lockfile. No database
migration, API shape, provider policy, or integration scope changes. Formatting
is presentation-only: the durable transcript retains the original Markdown.
Code/table overflow stays inside messages. The server remains the ordering
authority; drop feedback does not claim that a pending write has committed.

## Verification

Browser cases exercise Markdown structure/safety, allowed/blocked links,
no image/embed requests, partial streaming and reload, literal user/tool text,
desktop/narrow layouts, pointer/touch/keyboard sorting, cancellation, persisted
order, pending locks, and conflict recovery. Tests await actual drag/target
transitions before dropping, rather than assuming input dispatch equals completed
layout/collision processing. Results belong in the
[application report](../verification/application.md).
