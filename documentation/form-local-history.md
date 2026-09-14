# Previous submissions on this device

Public users can **see copies of forms they already submitted** without signing in and without any extra server CRUD. Each successful Save stores a snapshot in this browser’s `localStorage`. Opening **Previous submissions** lists those copies and fills the form so they can review or print.

This is separate from [Remember details](form-remember-details.md), which only prefills request-header fields for the *next* new form.

## Why not cookies?

| Store | Fit for full submissions? |
|-------|---------------------------|
| Cookie (`cubesyncFormPrefs`) | No. Browsers cap cookies near 4 KB, the remember-details cookie is already capped at 3.5 KB, and cookies are sent on every request (including `/api/cube-request-submit`). |
| `localStorage` (`cubesyncFormHistory`) | Yes. Same-origin, not sent to the lab, typically ~5 MB, enough for a short history of full request + results snapshots. |
| Service worker Cache API | For the app shell, not form data. |
| Firestore read by `?id=` | Staff-only. Public users cannot read `cubeRequests` (no sign-in, no IDOR). |

## What is saved

After a successful public Save, `app.js` calls `CubeSyncFormHistory.saveSubmission(payload, id)`.

Each entry keeps:

- Firestore document `id` from the submit API
- `submittedAt`
- A short summary (customer, cube job #, location, date of cast, …)
- The full request payload, including **TEST RESULTS**, extra fields, and free-text flags

It does **not** keep reCAPTCHA tokens. Oldest copies are dropped after 25 entries or ~400 KB.

## Restore

| Path | Behavior |
|------|----------|
| **Previous submissions** | Lists local copies. Choosing one fills the form and shows a banner: this is a device copy, not a lab fetch. Save still creates a **new** lab request (the public API is create-only). |
| Reload with `?id=` after submit | Staff: live Firestore record wins. Public users: Firestore read is denied, so the matching local copy is shown instead of “permission denied”. |
| **Forget copies on this device** | Deletes the `localStorage` list only. It does not delete lab records. |

Copies exist only in **this browser on this device**. Clearing site data, another phone, or a different profile will not show them.

## Code

| Piece | Role |
|-------|------|
| `cubesync-form-history.js` | Snapshot read/write, caps, labels |
| `app.js` | Save-after-submit, list UI, Firestore-then-local load |
| `form-history.test.js` | Storage unit tests |
| `app-unit.test.js` / `app-functional.test.js` | List, fallback, submit snapshot |
