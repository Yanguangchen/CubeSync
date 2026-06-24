# After-6pm Next-Day Date Rule

## Business rule

Concrete cube test requests submitted after **6:00 pm Singapore Standard Time
(UTC+8)** are for the **next day's work**. The lab does not process requests
received late in the day until the following morning, so to avoid staff
manually correcting every late-evening submission, the form pre-fills
`dateOfCast` with tomorrow's date when the page is loaded after 6 pm SGT.

The customer can still change the date if they need to.

---

## Implementation

### `cubesync-form-data.js` — `getDefaultCastDate(now?)`

```js
getDefaultCastDate()          // → "2026-06-25" (if current SGT time ≥ 18:00)
getDefaultCastDate(timestamp) // injectable for tests
```

- Converts the supplied (or current) UTC timestamp to Singapore time by
  adding the fixed UTC+8 offset.
- If the resulting local hour is **≥ 18**, advances the date by one day.
- Returns a `YYYY-MM-DD` string suitable for an `<input type="date">` value.
- Singapore Standard Time has no DST, so the offset is always +8 h.

### `app.js` — DOMContentLoaded handler

Immediately after seeding the initial result rows, before autocomplete or
field-config are applied:

```js
const dateInput = formEl.elements["dateOfCast"];
if (dateInput && !dateInput.value) {
  dateInput.value = formData.getDefaultCastDate();
}
```

The guard `!dateInput.value` means the rule only fires on a **fresh/empty
form**. When a saved record is loaded via `?id=`, `populateForm` sets the
stored value and the pre-fill is skipped.

---

## Time boundary examples

| Submission time (SGT) | UTC equivalent | `dateOfCast` default |
|-----------------------|---------------|----------------------|
| 17:59 | 09:59 UTC | today |
| 18:00 | 10:00 UTC | **tomorrow** |
| 23:59 | 15:59 UTC | tomorrow |
| 00:00 (next day) | 16:00 UTC | new today |

---

## Test coverage

### `form-field-config.test.js` — unit tests for `getDefaultCastDate`

| Test | Scenario |
|------|----------|
| `returns today before 6pm SGT` | 09:59 UTC → 17:59 SGT → today |
| `returns tomorrow at exactly 6pm SGT` | 10:00 UTC → 18:00 SGT → tomorrow |
| `returns tomorrow after 6pm SGT` | 14:30 UTC → 22:30 SGT → tomorrow |
| `returns today at midnight SGT (new day)` | 16:00 UTC → 00:00 SGT → new today |
| `rolls month boundary correctly` | 2026-06-30 22:00 SGT → 2026-07-01 |

### `app-unit.test.js` — wiring tests

| Test | What it verifies |
|------|-----------------|
| `pre-fills dateOfCast with today when loaded before 6pm SGT` | Wires `getDefaultCastDate` result to the input |
| `pre-fills dateOfCast with tomorrow when loaded at or after 6pm SGT` | Same, next-day branch |
| `does not override dateOfCast when already populated` | Guard `!dateInput.value` prevents overwriting a saved/loaded value |

---

## If the cutoff time ever changes

1. Update `AFTER_HOURS_CUTOFF` in `cubesync-form-data.js` (currently `18`).
2. Update the time examples in this document.
3. The unit tests use injected timestamps, so they will fail immediately if
   the constant drifts — update the test comments and UTC equivalents to match.
