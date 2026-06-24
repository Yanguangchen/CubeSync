# Field Visibility Configuration

## Overview

Staff can hide individual request fields from the public customer form via
**Field Settings** on the dashboard.  Hidden fields are skipped during both
client-side and server-side validation so customers are never blocked by a
field they cannot see.

---

## The bug this feature fixed

**Symptom:** "Please fill in all request details before submitting: Customer
(Billing), Contact, Person In Charge, Manager In Charge" appeared on the
customer form even after those fields were disabled in Field Settings.

**Root causes (two separate layers):**

| Layer | What went wrong |
|-------|----------------|
| Client | `activeFieldConfig` was `null` during a race between page load and the async Firestore fetch, so `validateCubeRequestForm` saw defaults (all fields required) instead of the saved config |
| Server | `api/cube-request-submit.js` called `validateCubeRequestPayload(clean)` with no config — always required all 13 fields regardless of what the dashboard had disabled |

Both layers had to be fixed independently; fixing only the client let
submissions reach the server, which then rejected them with the same message.

---

## Data flow

```
Dashboard staff
  └─ uncheck fields in Field Settings dialog
       └─ saveFormFieldConfig(config)
            └─ Firestore: settings/formFieldConfig
                 │
                 ├─ Customer form (browser)
                 │    loadAndApplyFormFieldConfig()
                 │      1. Reads localStorage cache (synchronous)
                 │         → onSyncApply sets activeFieldConfig immediately
                 │      2. Fetches Firestore config (async)
                 │         → updates activeFieldConfig + localStorage cache
                 │    applyFormFieldConfig()
                 │      → sets input.hidden, input.disabled,
                 │        input.dataset.configDisabled = "true"
                 │    validateCubeRequestForm(form, activeFieldConfig)
                 │      → reads data-config-disabled from DOM (ground truth)
                 │        so hidden fields are skipped even if activeFieldConfig
                 │        is stale (race window between sync and async apply)
                 │
                 └─ api/cube-request-submit (Vercel serverless)
                      fetches settings/formFieldConfig from Firestore
                      → validateCubeRequestPayload(payload, fieldConfig)
                         disabled fields are excluded server-side too
                      → saves to Firestore: cubeRequests/{id}
```

---

## Key files

| File | Role |
|------|------|
| `cubesync-form-data.js` | `applyFormFieldConfig` — hides fields, sets `data-config-disabled`; `validateCubeRequestForm` — reads DOM state as ground truth |
| `app.js` | `loadAndApplyFormFieldConfig` — fires `onSyncApply` synchronously from localStorage so `activeFieldConfig` is never null at submit time |
| `api/cube-request-submit.js` | Fetches `settings/formFieldConfig` before calling `validateCubeRequestPayload` |
| `firestore.rules` | `settings/formFieldConfig` — `allow get: if true` (public read) so the customer form and the serverless function can both read the config without auth |
| `dashboard.js` | `saveFieldConfig` → `store.saveFormFieldConfig(config)` writes the config that all other layers read |

---

## Why two independent fixes were needed

The client fix alone is not enough:
- The client fix prevents the validation error UI from showing.
- But without the server fix, the payload reaches the API and is rejected 400.

The server fix alone is not enough:
- Without the client fix, `activeFieldConfig` is null during the race window.
- The client-side validation would block the submit before the API is even called.

---

## Race condition detail (client)

On first visit (empty localStorage), the sequence is:

1. `DOMContentLoaded` fires.
2. `loadAndApplyFormFieldConfig` reads localStorage → empty → `config = null`.
3. `applyFormFieldConfig(form, null)` applies **defaults** (all fields visible).
4. **`onSyncApply(defaultConfig)` fires synchronously → `activeFieldConfig = defaultConfig`** ← fix point.
5. Firestore fetch starts (async).
6. [User can interact here — `activeFieldConfig` is defaults, fields are all visible, validation is correct.]
7. Firestore responds → `applyFormFieldConfig(form, remoteConfig)` hides fields, sets `data-config-disabled`.
8. `activeFieldConfig = remoteConfig`.

After step 7, if the user submits:
- `validateCubeRequestForm` reads `data-config-disabled` from the DOM directly.
- Hidden fields are skipped regardless of what `activeFieldConfig` says.
- This is the **ground-truth fallback** that covers any remaining race window.

---

## Test coverage

### `form-field-config.test.js`

| Test | What it verifies |
|------|-----------------|
| `validateCubeRequestPayload skips disabled required fields` | Core config-aware validation logic |
| `validateCubeRequestForm respects active field config` | Form-level validation passes config through |
| `validateCubeRequestForm skips fields whose DOM input has data-config-disabled` | DOM ground-truth fallback covers the race window |
| `applyFormFieldConfig hides disabled request fields and result columns` | DOM state is set correctly |

### `app-functional.test.js`

| Test | What it verifies |
|------|-----------------|
| `app.js applies cached field config and skips disabled required fields` | End-to-end: localStorage config → form submits successfully |
| `disabled required fields do not block submission when Firestore is still pending` | Race condition: Firestore never responds but localStorage config is applied |
| `app.js applies cached field config on index.html and hides disabled fields` | Original form (index.html) is also covered |

### `api-handler.test.js`

| Test | What it verifies |
|------|-----------------|
| `submission API accepts empty disabled required fields when formFieldConfig disables them` | Server reads config and skips disabled fields |
| `API still rejects an enabled required field that is empty` | Disabling one field doesn't accidentally disable others |
| `API accepts empty value for each individually disabled required field` | Every one of the 13 required fields can be disabled independently |
| `API enforces remaining enabled required fields when only some are disabled` | Partial disable: enabled fields are still required |
| `API falls back to requiring all fields when formFieldConfig Firestore fetch throws` | Network/permission error → safe default (strict validation) |
| `API falls back to requiring all fields when formFieldConfig doc does not exist` | Config not yet created → safe default (strict validation) |

---

## Adding a new required field

If you add a field to `REQUIRED_FORM_FIELDS` in `cubesync-form-data.js`:

1. Add the field to the HTML form (both `index.html` and `glassmorphic.html`).
2. Add the field to the `APP_SHELL` list in `sw.js` if it has its own asset.
3. Confirm the field appears in the Field Settings dialog (it is rendered
   automatically from `FORM_FIELDS` in `renderFieldConfigEditor` in `dashboard.js`).
4. **No changes needed** to the validation layers — `getActiveRequiredFormFields`
   and the API's `validateCubeRequestPayload(clean, fieldConfig)` call both read
   from `REQUIRED_FORM_FIELDS` dynamically.
5. Run the full test suite. The `API accepts empty value for each individually
   disabled required field` test iterates `REQUIRED_FORM_FIELDS`, so it will
   automatically cover the new field.

---

## Service worker note

`settings/formFieldConfig` is fetched at runtime (not cached by the service
worker). Changes to Field Settings take effect on the next page load without
requiring a cache bust. The SW only caches static JS/CSS assets.
