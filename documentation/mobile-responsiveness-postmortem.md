# Mobile Responsiveness — What Went Wrong & Fixes

_Date: 2026-06-21_

This documents the root cause behind the missing mobile responsiveness on the
**Human Dashboard** (`dashboard.html`) and the **RPA Dashboard**
(`rpa-dashboard.html`), and the off-screen dropdown menu, plus the fixes applied.

## Summary

| Symptom | Root cause | Status |
| --- | --- | --- |
| Human dashboard "has no responsiveness" | `css/dashboard.css` was **corrupted** — a duplicated block hid/clobbered the real responsive rules | Fixed |
| `#dropdownMenu` disappears off-screen on mobile | Dropdown is `position:absolute; right:0; min-width:220px` anchored to a menu container that was not pinned to the right once the topbar stacked | Fixed |
| RPA dashboard "has no responsiveness" | `css/rpa/xp-theme.css` contained **zero** media queries | Fixed |

## 1. The corrupted `css/dashboard.css`

### What went wrong
During the `32aef61` ("linter fix") restructure — which moved `dashboard.css`
from the repo root into `css/` and rewrote ~792 lines — a bad paste/merge
duplicated a large region of the stylesheet and left an `@media print` block
unterminated.

Concretely, the file contained (around the original lines 1093–1287):

- A **broken `@media print` block**: it opened `@media print { … }` but, instead
  of closing with the `.print-area { display:block; … }` rule, it ran straight
  into stray text:

  ```css
    .print-area,
    .print-area * { visibility: visible; }

     Responsive                       /* <-- stray, no opening comment, no close */
     ============================ */
  @media (max-width: 980px) { … }     /* <-- duplicate section begins here */
  ```

- A **full duplicate** of the `Responsive`, `Hamburger & Dropdown Navigation`,
  and `Print` sections pasted after it.

Because the first `@media print { … }` was never properly closed, every rule
that followed (including the duplicated responsive breakpoints and the hamburger
menu) was effectively **nested inside `@media print`** — i.e. they only applied
when printing, never on screen. That is why the dashboard appeared to have "no
mobile responsiveness": the `@media (max-width: 980px)` and
`@media (max-width: 680px)` rules existed but were dead on a normal viewport.

This corruption was present in `9312c4b` and earlier and survived subsequent
commits because the CSS still "looked" plausible and braces happened to balance
overall.

### Fix
Removed the duplicated/broken region (the stray text + the second copy of the
Responsive/Hamburger/Print sections), leaving a single, correctly terminated
`@media print` block. Verified by counting braces (balanced) and confirming the
`@media (max-width: …)` rules now sit at the top level of the stylesheet.

## 2. Off-screen dropdown menu (`#dropdownMenu`)

### What went wrong
`.dropdown-menu` is positioned `position:absolute; right:0; left:auto;` with a
hard `min-width:220px`, anchored to `.menu-container` (`position:relative`).

On mobile the topbar switches to `flex-direction:column` and
`.top-actions { justify-content: stretch }`. `stretch` is not a valid
`justify-content` value, so it behaved as `flex-start` — the menu container was
no longer pinned to the right edge. With `right:0` resolving against a container
that could sit mid-row, the fixed 220px-wide panel extended past the viewport
edge and was clipped off-screen.

(Separately, even when the responsive rules _did_ apply, issue #1 above meant
they only ran in print mode — so on screen there was no mobile handling at all.)

### Fix
In the `@media (max-width: 680px)` block:

- `.top-actions` now uses `flex-wrap: wrap; justify-content: flex-end;`
- `.menu-container { margin-left: auto; }` pins the dropdown anchor to the right.
- `.dropdown-menu` is clamped to the viewport:
  `right: 0; left: auto; min-width: 200px; max-width: calc(100vw - 24px);`

So the panel now opens leftward from the right edge and can never exceed the
screen width.

## 3. RPA dashboard had no media queries

### What went wrong
`css/rpa/xp-theme.css` styled the Windows-XP-themed shell entirely for desktop:

- `.xp-toolbar` is laid out with an inline `display:flex` and **no `flex-wrap`**,
  so its Previous/Today buttons, date picker, "Export all CSV" button and date
  badge overflowed horizontally on narrow screens.
- `.xp-window` was fixed at `min(1000px, 95vw)` with `margin: 40px auto`.
- `.dashboard-shell`/`.workspace` used desktop padding (20px / 10px).
- The fixed `.xp-taskbar` (start button + task links + sign-out tray) could be
  squeezed off the row.
- `.current-date-badge` was an oversized 18px.

### Fix
Added two breakpoints to `css/rpa/xp-theme.css`:

- **`max-width: 768px`** — `.xp-toolbar { flex-wrap: wrap }`, full-width window
  with an 8px margin, reduced shell/workspace padding, smaller date badge,
  trimmed bottom padding on the table wrap, and a taskbar that shrinks task
  buttons while protecting the start button and sign-out tray (`flex-shrink:0`).
- **`max-width: 480px`** — smaller title text, stacked/tappable toolbar controls
  (`flex: 1 1 auto`, info button stays a fixed circle), and the date badge spans
  its own full-width row.

The shared 940px-min-width data table still scrolls inside `.table-wrap`
(`overflow-x:auto`), which is the intended pattern for a wide RPA queue table.

## 4. `.tool-section.right` overflows the viewport on both forms

Affects `index.html` (styled by `css/styles.css`) and `glassmorphic.html`
(styled by `css/glassmorphic.css`).

### What went wrong
The form action bar (`.page-tools`) is a CSS grid: `1fr auto 1fr`. The right
cell, `.tool-section.right`, is a `display:flex; justify-content:flex-end`
container holding a **fixed-width reCAPTCHA widget (~304px)**, a status span, and
three buttons (Save / Print / Clear) — with **no `flex-wrap`**.

Two compounding defaults caused the overflow:

1. Grid and flex items default to `min-width: auto`, meaning they refuse to
   shrink below their content's intrinsic width. The non-shrinkable 304px
   reCAPTCHA forced the right (and mirrored left) `1fr` track to be very wide, so
   the whole bar exceeded the viewport.
2. With no wrapping, the buttons + reCAPTCHA stayed on one line and spilled past
   the screen edge — visible at mid widths (above the 560px stacking breakpoint)
   and still on very narrow screens.

### Fix
In both `css/styles.css` and `css/glassmorphic.css`:

- Added `.tool-section { min-width: 0; }` so the grid columns can shrink below
  their content width.
- Added `flex-wrap: wrap; align-items: center;` to `.tool-section.right` so its
  controls wrap onto a new line instead of overflowing.

(The reCAPTCHA widget itself is a fixed 304px and cannot shrink below that, but
it now wraps cleanly and fits standard phone widths of ~360px+.)

## 5. `.xp-window-body` / whole RPA container overflows right on mobile

### What went wrong
The RPA queue table (`.form-table.rpa-table`) keeps the shared
`min-width: 940px`. It lives inside a CSS grid:
`.workspace` → `.list-panel` → `.table-wrap` (`overflow-x:auto`) → table.

Even with `overflow-x:auto` on the wrap, the **grid item** `.list-panel`
defaults to `min-width: auto`, so it refused to shrink below the 940px table's
min-content. That forced `.list-panel` — and therefore `.xp-window-body` and the
whole XP window — wider than the viewport, pushing everything to the right; the
`.table-wrap` scrollbar never engaged.

Two contributing factors:

1. Grid items default to `min-width: auto` (won't shrink below content).
2. The `@media (max-width: 980px)` rule used bare `grid-template-columns: 1fr`.
   A bare `fr` track takes its minimum from content, so it expanded to 940px. On
   top of that, the RPA `.list-panel` has an inline `grid-column: span 2`, which
   on a single-column grid spawns an **implicit** `auto` column wide enough to
   overflow.

### Fix (in `css/dashboard.css`, so it covers both dashboards)
- `.list-panel, .detail-panel { min-width: 0; }` — let the grid items shrink so
  the table scrolls inside `.table-wrap` instead of widening the page.
- `@media (max-width: 980px) .workspace { grid-template-columns: minmax(0, 1fr); }`
  — keep the single column shrinkable.
- `.workspace { grid-auto-columns: minmax(0, 1fr); }` — make implicit tracks
  shrinkable too, neutralising the RPA inline `grid-column: span 2`.

The human dashboard shares this exact structure and would have overflowed at
≤980px for the same reason, so the fix lives in `dashboard.css` and benefits
both views.

## Lessons / follow-ups

- The duplicate slipped through because braces balanced and the file still
  parsed; consider adding a CSS lint/format step (e.g. `stylelint` /
  `prettier --check`) to CI to catch unterminated/duplicated blocks.
- When moving/renaming large CSS files, diff the before/after rule list rather
  than just line counts.
