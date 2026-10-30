# Frontend Concept

Status: approved frontend concept, updated by the user's frontend refinements.
Implementation evidence is tracked in the [application report](verification/application.md).

## 1. Reference and authority

The user-provided [clickdummy](../clickdummy.html) is the frontend's visual
baseline. It is an interactive standalone HTML preview with sample data, not
production application code.

Preserve its information hierarchy, dark visual direction, compact cards, and
chat placement. It is not a pixel-perfect contract, source for domain logic, or
reason to change the agreed stack. The production frontend remains Next.js,
React, Tailwind CSS, and Framer Motion.

The source file is unchanged. Its initial file-URL preview was unavailable in the
integrated browser; subsequent visual checks use the actual local application.

“DevDesk” is the preview's working label, not a separately confirmed product name.

## 2. Information hierarchy

### Desktop

```text
+----------------+--------------------------------+---------------------+
| Workspace rail | Header / refresh               | Assistant header    |
|                |                                |                     |
| Context        | Todos: input + open list       | Conversation        |
| Color legends  | Completed section (collapsed)  | Tool outcomes       |
|                |                                | Deletion approvals  |
|                | Work / Reviews / My PRs tabs    |                     |
|                | Counts beside each tab name    |                     |
|                | Selected work or PR view       | Prompt input        |
+----------------+--------------------------------+---------------------+
```

- Todos are the primary component at the top of the main content column.
- Assigned work items, review requests, and own PRs share one compact tabbed panel
  beneath todos. Only the selected view is visible; assigned work is selected
  initially.
- Tab names include count bubbles, including zero. Counts cover all locally
  cached rows in each dataset and update without changing the selected tab.
  Stale/incomplete datasets retain their counts with a visible tab warning.
- Tabs expose labelled tab/panel relationships. Left/Right arrows wrap; Home/End
  select the first/last tab. Switching tabs is local, with no upstream read or
  mutation. Labels wrap on narrow screens without hiding the count bubbles.
- The right-hand chat is persistently accessible on desktop.
- Within the selected work-item team, native disclosures group items by board
  and swimlane in board/lane order. Groups start expanded and show item counts;
  pointer and keyboard collapse/expand them locally without API requests.
  Default lanes are labelled "Default swimlane" when unnamed. Unmapped and
  unavailable assignments remain visible; stale lane caches expose a warning
  and their last successful synchronization timestamp independently of team areas.
- The left rail provides noninteractive repository/team-board legends, not filters
  or a second application hierarchy.
- The app fills the viewport. The central column has its own vertical scrollbar;
  document scrolling must not move the sidebar or desktop chat.
- There is one dashboard, not separate Overview and Daily Todos pages.

Exact column widths and breakpoints are implementation details, not a mandate to
copy the prototype's fixed dimensions.

### Narrow screens

- Keep one main content column and preserve access to all primary actions.
- Move chat to an accessible drawer, opened from a persistently reachable trigger.
  Do not copy the prototype's below-content chat placement.
- Compact context/navigation without hiding essential actions.
- Validate 375px, 768px, and 1440px viewports as required by
  [UX-002](requirements/experience-and-operations.md#ux-002--dark-first-responsive-design).
- Drawer focus, Escape behavior, and reduced motion follow the accessibility
  criteria; a responsive layout is not only a screenshot requirement.

## 3. Visual vocabulary

Starting tokens observed in the preview:

| Token | Preview value | Intended use |
| --- | --- | --- |
| Background | `#0b0e13` | Overall canvas |
| Panel | `#121720` | Primary cards |
| Raised panel | `#171e29` | Hover/secondary surfaces |
| Border | `#27303d` | Subtle separation |
| Main text | `#e7ebf1` | Primary content |
| Muted text | `#8995a7` | Secondary metadata |
| Accent | `#8b9eff` | Primary actions and focus |
| Positive accent | `#69c9a0` | Non-exclusive success indication |
| Card radius | `13px` | Soft panel corners |

Translate these into a small Tailwind token set. Values may be adjusted to meet
contrast, focus, and readability requirements; the preview is not evidence that
all of its color combinations are accessible.

Use a system font stack initially. The preview's reference to Inter does not
require downloading fonts from an external service. Preserve readable metadata
without treating its very small font sizes as binding.

Framer Motion provides restrained state transitions. Use no looping decoration
or animation delays before acknowledging an action. Reduced-motion preferences
take precedence over visual imitation.

Open todos expose a compact, borderless 33px drag handle (75% of the original
44px size), with a proportionally scaled icon and visible keyboard focus.
Dragging is restricted to the vertical axis, even with diagonal pointer movement.
Pointer/touch dragging previews placement without making the whole row draggable;
links, text selection and ordinary row
controls remain independent. Handle keyboard support uses Space, arrows, and
Escape, alongside the existing Up/Down buttons. The shared server mutation
commits order; cancelled/failed dragging does not claim successful persistence.
Completed todos remain ordered by completion time and have no sorting handle.

Assistant messages use CommonMark/GFM for saved and partial streamed output:
headings, emphasis, lists, inert task checkboxes, quotes, inline/fenced code and
tables. Code/table overflow stays inside the message. User messages and tool
outcomes remain literal. Raw HTML is skipped and image descriptions render
without fetching images. Only exact known HTTPS ADO source links from todo
references or cached rows become clickable; Markdown does not broaden scope.

Tool outcomes use a native collapsed disclosure, not a full chat bubble. Its
32px one-line summary names the action and reports failure, completion, pending
approval, or explicitly unstructured content. Complete transcript status alone
does not imply a successful tool outcome. Expand by pointer or Enter/Space for
the entire literal payload and local timestamp. Long content wraps/scrolls
inside the chat without executing HTML or Markdown.

## 4. Demo behavior versus production rules

| Preview behavior | Production interpretation |
| --- | --- |
| “Today's todos”, “Daily Todos”, automatic carry-over text | Use a persistent todo list without day assignment, rollover, or daily copies |
| Browser localStorage as todo persistence | Server-owned SQLite; the browser is not the source of truth |
| Open and completed items mixed together | Open list plus an initially collapsed completed section, newest completion first |
| One-click irreversible deletion | Confirmation for manual and AI deletion; exact one-use AI approval with 5-minute expiry |
| Double-click and native prompt for editing | Accessible edit action usable by keyboard; dialog/inline details remain a UX implementation choice |
| Demo title validation | Trimmed title, 1–500 characters, explicit errors |
| Demo has no actual external todo associations | Production supports one optional work-item or PR reference per todo |
| Repository toggles hide both PRs and work items | Keep sidebar legends informational; local in-tab chips group work by team and PRs by repository without restricting synchronized data |
| Repository color is the only context cue | Include textual project/repository context; color is supplementary |
| Fake Refresh success after a timeout | Real queued/running/success/failure state from the sync coordinator |
| Keyword-driven canned assistant replies | Copilot SDK, automatic intent classification, bounded tools, durable transcript |
| Unconditional assistant suggestions | Suggestions do not themselves authorize or execute changes |
| “Demo” indicator and canned data | Truthful integration/run status; distinguish disabled, stale, failed, and empty |
| Stacked chat on smaller screens | Accessible drawer with a persistently reachable trigger |
| Two navigation labels | One dashboard with contextual rail |

The date in the header, if retained, is informational only. Whether to display a
date and the final product copy remain detailed UX choices; no business behavior
may depend on that date.

## 5. Azure DevOps context, legends, and local grouping

Conceptual hierarchy:

```text
Organization
    Project
        Work items
        Teams -> Board/backlog views over work items
        Git repositories
            Pull requests
```

Boards are configured team views, not repository folders. A work item may be
unlinked or related to code in multiple repositories. The preview's repository
names are sample data, not discovered repositories.

The delivered [Settings increment](requirements/settings.md) supersedes the
original fixed workspace while preserving the visual concepts:
- Initial workspace: empty Work Item Sources and Repositories, including upgrades.
  Settings offers readable teams and repositories grouped by project.
- Work items: the current user's assigned records in selected team areas, across
  all types and states. Repositories govern PR datasets independently.
- Repository legend: no display controls; consistent colored dots and row edges
  identify each configured repository in both PR sections.
- Board legend: use selected readable teams and full area-path scopes.
  Annotate work items with every matching team-board scope; text accompanies
  color, and multi-match edges carry all matching colors.
- Work-item tabs/bubbles and board markers use warm gold/red tones. PR
  tabs/bubbles and repository markers use a separate cool violet/teal/blue
  palette, including disjoint hue ranges for additional legend entries.
- The two initial team-dot colors contrast at least 3:1 with each other and with
  their dark sidebar/panel surfaces. Names remain the authoritative context cue.
- Group-only review requests: hide once all relevant reviewer groups approve.
  An unapproved personal reviewer entry remains actionable.

Neither legend changes the persisted server selection. Team scope
matching uses case-insensitive area paths and each rule's `includeChildren`, not
repository names. It is not a reproduction of board columns, visible work-item
types, or iteration filters. Unknown/unmatched mappings and stale/failed team
metadata have distinct text; last-good scopes survive restart and failed refresh.

The later [ADR-0014](adr/0014-local-scope-chips-and-tool-outcomes.md) adds colored
chips inside the counted tab body, superseding only the earlier prohibition on
local display grouping:
- Exactly one chip is active; use stable legend order and initially select the
  first team/repository, including zero-count known scopes. There is no All chip.
- Retain the selected identity independently per tab during cache updates.
  Display the first available group if it disappears; reload resets the choices.
- Work items appear in every matching team. Append nonempty "No team" and
  "Assignment unknown" groups; missing area metadata or unresolved/stale
  nonmatches are unknown. Retain stale last-good positive matches with warnings.
  Unexpected repository metadata has its own unknown fallback.
- Count rows per chip; overlapping team counts can exceed the dataset total.
  Tab counts still describe all cached rows. Selected empty groups have an
  explicit empty state; errors and freshness notices are not filtered.
- Reuse sidebar/row colors for chip dots, borders, and active fill. Keep readable
  text and keyboard focus; color is supplementary, not the selection contract.
- Buttons expose names/counts and `aria-pressed`; no nested tab widget is needed.
  Selection does not trigger HTTP reads, writes, or provider synchronization,
  and does not change todo references or chat's complete cached context.

Enter sends a chat message; Shift+Enter inserts a newline. Todo input retains
native Enter submission. Both guard IME composition and pending submissions;
chat also prevents blank or cleanup-blocked requests.

See the [Azure DevOps concept](azure-devops-concept.md) for observed team/area
relationships and the remaining technical group-membership checks.

## 6. Frontend acceptance approach

Before implementation acceptance:
- Compare the actual desktop UI to the visual hierarchy above and the preview,
  not to the preview's persistence or canned responses.
- Exercise all primary actions by keyboard, including reorder, edit, chat drawer,
  confirmation, and cancel.
- Check reduced motion, focus visibility, readable metadata, and safe links.
- Test empty/loading/stale/failed states absent from the static sample cards.
- Prove UI acknowledgement follows actual persistence and sync outcomes.

See [UX requirements](requirements/experience-and-operations.md#experience),
[todo rules](requirements/todos.md), and
[ADR-0008](adr/0008-clickdummy-visual-baseline.md).
