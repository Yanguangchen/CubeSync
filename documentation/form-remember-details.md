# Remember form details

Customers who submit many cube requests can store the **request-details** portion of the public form in a browser cookie and have those values filled in on the next visit.

## What is saved

**Remember details** (`#rememberDetailsButton`) writes cookie `cubesyncFormPrefs` with:

- Canonical request fields from `FORM_FIELDS` (project, customer, supplier, grades, personnel, slump, location, and so on)
- Custom request fields (`extraFields`)
- Free-text dropdown flags (`customFields`)

It does **not** save:

| Omitted | Why |
|---------|-----|
| TEST RESULTS table | Each job has its own specimens, barcodes, and test dates |
| Date of cast | Still follows the [after-6pm next-day rule](after-6pm-next-day-rule.md) |
| Cube Job # / Enable Manual Cube Job # | Unique per submission |
| Test Item | Locked to BS EN 12390-3: 2019 |

The cookie is `Path=/; SameSite=Lax; Max-Age=365 days` (and `Secure` on HTTPS) so both the Digital and Original forms share it. Payload is capped near 3.5 KB; oversized custom fields are dropped so the rest still saves.

## Restore on load

`app.js` restores the cookie after field settings are applied, only when the page is **not** loading an existing record (`?id=`). Empty fields are filled; values the user already typed are left alone. **Forget saved details** (`#forgetDetailsButton`) clears the cookie. **Clear** on the form empties the current page only — it does not forget the cookie.

## Code

| Piece | Role |
|-------|------|
| `cubesync-form-prefs.js` | Collect, cookie read/write, apply |
| `app.js` | Button wiring and page-load restore |
| `form-prefs.test.js` | Cookie and field-selection unit tests |
| `app-unit.test.js` | Remember / restore / forget / `?id=` skip |
