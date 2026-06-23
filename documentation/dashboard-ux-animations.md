# Dashboard UX Animations

Motion polish on the Human Dashboard (`dashboard.html`, styles in `css/dashboard.css`). All effects honour `prefers-reduced-motion: reduce`.

## On-load entrance

When the dashboard shell is revealed after authentication (the `.is-hidden` class is removed from `.dashboard-shell`), the top bar and list panel **ease in** with a gentle rise + fade via the `dashboard-ease-in` keyframes, lightly staggered (top bar → list panel → user email). The detail panel is **excluded** because it has its own selection-driven reveal (below).

## Master–detail reveal & hide

On desktop (`min-width: 981px`) the detail panel (`#detailPanel`) is hidden until a form is selected:

- `dashboard.js` toggles `.has-detail` on the `.workspace` via `setDetailPanelVisible(visible)` — added in `viewForm()` (true when a form is shown, false when none is selected) — and mirrors it on the panel's `aria-hidden`.
- CSS scoped with `:has(.detail-panel)` (so the RPA workspace is unaffected) collapses the detail grid column when `.has-detail` is absent and eases the panel in from behind the list panel (`.list-panel` sits at a higher `z-index`) with a `transform`/`opacity` transition.
- A small **hide button** (`#detailHideButton`, the `×` at the panel's top-right) calls `viewForm(null)` to clear the selection and re-hide the panel. It is only visible while `.workspace.has-detail` is set.

On mobile (`max-width: 980px`) the workspace is a single column and the detail panel stacks below the list as before; the hide button still clears the selection.

## Tests

`dashboard-functional.test.js`:

- **"reveals the detail panel only when a form is selected"** — asserts `.has-detail` / `aria-hidden` flip on selection and that the hide button restores the hidden state and the "No form selected" title.

(The CSS-only entrance animation and transitions are presentational and not asserted directly.)
