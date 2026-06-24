# Test Item Field — Locked to BS EN 12390-3: 2019

## Business rule

CubeSync issues certificates for **one** class of test only:

> **Civil - Hardened Concrete - Compressive strength of cube - BS EN 12390-3: 2019**

Allowing customers to type a different value would produce certificates citing the wrong standard, which is a compliance risk.  The `testItem` field therefore:

- is always pre-filled with the canonical value above, and
- is rendered `readonly` so the customer cannot change it.

## Implementation

**Constant** — `cubesync-form-data.js` exports `FIXED_TEST_ITEM_VALUE`.  This is the single source of truth; all code that needs the string must reference this constant, never a hard-coded literal.

**Enforcement** — `applyFormFieldConfig` sets `input.value = FIXED_TEST_ITEM_VALUE` and `input.readOnly = true` on every call.  Because `applyFormFieldConfig` is called on `DOMContentLoaded` and again whenever a new result row is added, the lock is re-applied automatically and cannot be bypassed by resetting the form or adding rows.

**Dropdown file** — `dropdown-options/testitem.txt` retains a single entry matching `FIXED_TEST_ITEM_VALUE` so that any autocomplete initialised before the lock runs also provides only the correct option.

## Tests

`form-field-config.test.js` covers:

| Test | What it verifies |
|------|-----------------|
| `FIXED_TEST_ITEM_VALUE is the canonical BS EN 12390-3: 2019 test description` | The exported constant has exactly the right string. |
| `applyFormFieldConfig pre-fills testItem with FIXED_TEST_ITEM_VALUE` | An empty field is filled after config is applied. |
| `applyFormFieldConfig makes testItem readonly` | `readOnly === true` after config is applied. |
| `applyFormFieldConfig overrides any existing testItem value with the fixed value` | A field that already contains a wrong value is corrected. |
| `buildCubeRequestFromForm captures the locked testItem value` | The submission payload carries the correct string. |

## What to do if the standard ever changes

1. Update `FIXED_TEST_ITEM_VALUE` in `cubesync-form-data.js`.
2. Update `dropdown-options/testitem.txt` to match.
3. The five tests listed above will fail immediately if the constant drifts, guarding against typos.
