# Form Submission Throbber

Public request forms (`index.html`, `glassmorphic.html`) show a spinning **throbber** on the Save button while a submission is in flight, so users get clear feedback when the API is slow to respond.

## Behaviour

While `savePublicCubeRequest()` is awaiting the API, the Save button (`#saveFormButton`) is:

- **disabled** (prevents double-submits),
- given `class="is-busy"` and `aria-busy="true"` (renders the spinner + signals assistive tech),

and the status text (`#saveStatus`) reads `Saving...`. On success it becomes `Saved`; on failure it shows the error and re-enables the button. The state is always cleared in a `finally` block, so a thrown error never leaves the button stuck.

## Implementation

| Layer | Location | Detail |
|-------|----------|--------|
| Toggle | `app.js` → `setButtonBusy(button, isBusy)` | Sets `disabled`, toggles `.is-busy`, sets `aria-busy`. Called at the start of submit and in `finally`. |
| Styles | `css/shared/throbber.css` | `@keyframes cubesync-spin`; `button.is-busy::before` renders the spinner before the label; reusable `.throbber` element for other contexts. Honors `prefers-reduced-motion`. |
| Wiring | `css/styles.css`, `css/glassmorphic.css` | Both form stylesheets `@import url("shared/throbber.css")`. |

## Tests

`app-functional.test.js` → **"save button shows a throbber while the submission is in flight"** holds the `savePublicCubeRequest` promise open, asserts `is-busy` / `aria-busy="true"` / `disabled` and the `Saving...` status mid-flight, then resolves it and asserts the throbber clears and the status reads `Saved`.
