# Free-Text Dropdown Highlighting

Human-review flags for dropdown-backed request fields when users type a value instead of selecting from the autocomplete list.

## TDD progress

1. **Red:** Tests for `customFields` serialization, typed-vs-selected autocomplete behavior, and dashboard highlighting/count rendering.
2. **Green:** Free-text tracking in `app.js`, persisted `customFields` in `cubesync-form-data.js`, dashboard counter/legend/orange tint in `dashboard.js`.
3. **Refactor:** Centralized dashboard helpers (`customFields()`, `customFieldCount()`, `renderCustomFieldBadge()`, `renderCustomFieldLegend()`).
4. **Hardening:** Stronger contrast, preserve flags on dashboard edit, Firestore rules aligned with dashboard payload shape, patch updates for saves.
5. **Derivation fix:** `resolveFreeTextDropdownFields` — value-based review ignores stale metadata when a canonical option list exists; `localStorage` excluded from dashboard reference lists.
6. **Regression suite:** `free-text-dropdown.test.js` locks capture-vs-review semantics, union-merge anti-pattern, and dashboard wiring.

## Dropdown-backed fields

Defined in `DROPDOWN_OPTION_FIELDS` (`cubesync-form-data.js`):

| Field | Options file |
|-------|----------------|
| `projectErp` | `dropdown-options/project erp.txt` |
| `customerBilling` | `dropdown-options/customer billing.txt` |
| `supplier` | `dropdown-options/supplier.txt` |
| `concreteGrade` | `dropdown-options/Grade.txt` |
| `personInCharge` | `dropdown-options/person-in-charge.txt` |
| `managerInCharge` | `dropdown-options/manager-in-charge.txt` |
| `testItem` | `dropdown-options/testitem.txt` |
| `specimenSize` | `dropdown-options/size.txt` |

`reportGrade` is **not** dropdown-backed — it is always free text with no autocomplete.

## Public form capture (`app.js`)

`setupAutocomplete()` wires each dropdown field:

- **Typing** clears `dataset.selectedFromDropdown` and sets `dataset.freeTextEntry = "true"` when the value is non-empty.
- **Selecting** a suggestion sets `dataset.selectedFromDropdown = "true"` and clears the free-text flag.
- **Blur** re-applies the free-text flag if the value was typed and not chosen from the list.

On submit, `buildCubeRequestFromForm()` calls `collectCustomFields(form)`, which returns canonical field names for inputs with `dataset.freeTextEntry === "true"`. The API persists this array as `customFields` on the Firestore document.

## Dashboard display (`dashboard.js`)

After loading forms, the dashboard resolves flags per field:

```text
effectiveFlags = resolveFreeTextDropdownFields(
  raw,                   // stored document
  state.dropdownOptions, // canonical option lists (deployed files only)
  document.customFields  // capture-time metadata (fallback)
)
```

Resolution rules (`resolveFreeTextDropdownFields`):

- **Value-based (preferred):** if an option list is loaded for the field, flag it only when the stored value is **not** in that list (case-insensitive, trimmed). A value matching a valid option is never flagged — even if metadata says it was typed. This prevents valid selections (and valid typed values) from being tagged.
- **Metadata fallback:** if no option list is available for the field (e.g. the file failed to load), use the capture-time `customFields` entry.

`loadDropdownOptionSets()` fetches the **deployed `dropdown-options/*.txt` files only** — never `localStorage` — so the judgment is consistent across machines. (A staff browser’s cached suggestions must not change whether another user’s entry counts as free text.)

> The capture-time metadata intentionally flags *any* typed value, including ones matching a valid option. The dashboard ignores that metadata whenever it has an authoritative option list, which is why typing a valid option no longer shows as free text.

### Visual indicators (`css/dashboard.css`)

| Location | CSS |
|----------|-----|
| Form list row | `tr.has-custom-fields` — orange row background |
| List badge | `.custom-field-count` |
| Detail legend | `.custom-field-legend` |
| Detail field | `.detail-field.is-custom-field` + `.highlight-custom` on value |

Dark mode overrides live under `[data-theme="dark"]`.

## Dashboard edit behavior

When staff open the edit dialog, `applyFreeTextFlags(editForm, customFields(form))` restores `dataset.freeTextEntry` on flagged inputs so a save does not accidentally clear metadata. Patch updates only send `customFields` when the flag set actually changes.

## Firestore

- **Read/write:** `customFields` is an optional string array on `cubeRequests` (max 8 entries; each name must be in `DROPDOWN_OPTION_FIELDS`). Validated by `isValidCubeCustomFields()` in `firestore.rules`.
- **Submit API:** `/api/cube-request-submit` whitelists `customFields` on public POST.

## Tests

Dedicated regression suite: **`free-text-dropdown.test.js`** (run with `npm test`). It guards against the class of bugs where dashboard flagging disagrees with what users actually submitted.

| Layer | File | What it guards |
|-------|------|----------------|
| Capture | `app-functional.test.js` | Typed vs selected autocomplete; `customFields` on submit |
| Resolution | `free-text-dropdown.test.js` | `resolveFreeTextDropdownFields` value-based rules + metadata fallback |
| Wiring | `free-text-dropdown.test.js` | Dashboard uses `resolveFreeTextDropdownFields`, not union merge; option loader skips `localStorage` |
| Integration | `free-text-dropdown.test.js`, `dashboard-functional.test.js` | End-to-end list badges with mocked option files |
| Unit helpers | `form-data.test.js` | `deriveFreeTextDropdownFields`, `collectCustomFields`, `applyFreeTextFlags` |
| API | `api-handler.test.js` | `customFields` persisted through submit API |

### Regression scenarios (`free-text-dropdown.test.js`)

| Test | Bug it prevents |
|------|-----------------|
| `stale capture metadata does not flag a value that matches an option` | Dashboard tags valid selections because metadata says “typed” |
| `merging metadata with derive re-introduces false positives` | Using `mergeFreeTextDropdownFields(metadata, derive(...))` instead of `resolveFreeTextDropdownFields` |
| `novel free text is flagged even without capture metadata` | Missing flags on older forms that lack `customFields` |
| `browser-local options must not suppress free-text flags` | Merging staff `localStorage` into the reference list hides novel values |
| `capture metadata and dashboard resolution use different rules` | Submit path and review path accidentally sharing one rule |
| `metadata fallback applies only when option list is unavailable` | Fallback firing when a canonical list exists |
| `dashboard loadForms resolves flags with resolveFreeTextDropdownFields` | Wiring regression in `dashboard.js` |
| `dashboard option loader uses deployed files only` | `loadDropdownOptionSets` reading `localStorage` |
| `integration: dashboard flags novel supplier…` | End-to-end: localStorage cache must not clear flags for file-unknown values |

### Capture vs review semantics

| Stage | Function | Rule |
|-------|----------|------|
| **Submit** (public form) | `collectCustomFields()` | Flag any dropdown field the user **typed** (`dataset.freeTextEntry`), even if the text matches a valid option |
| **Review** (dashboard) | `resolveFreeTextDropdownFields()` | Flag only when the **stored value** is absent from the deployed option file; ignore stale metadata when a list exists |

These rules are intentionally different. Tests in `app-functional.test.js` assert capture behavior; tests in `free-text-dropdown.test.js` assert review behavior.
| `dashboard-functional.test.js` | Badge, legend, `.highlight-custom` count in detail view |

## Troubleshooting

| Symptom | Likely cause | Test that catches it |
|---------|----------------|----------------------|
| Valid selections get flagged | Option file not loading → metadata fallback flags any typed value | `integration: dashboard flags novel supplier…` |
| Valid selections get flagged | Code merged metadata + derive instead of `resolve` | `merging metadata with derive re-introduces false positives` |
| Stored value differs from option formatting | Saved value must match an option line (case/space-insensitive) | `resolve normalizes whitespace…` |
| Novel free text not flagged | Value only in staff browser `localStorage`, not in deployed file | `browser-local options must not suppress free-text flags` |
| Novel free text not flagged | Value happens to exist in the option file, or no list and no metadata | `novel free text is flagged even without capture metadata` |
| No flags for any form | Option files 404 and no metadata | Deploy / `deployment-config.test.js` |
| Flags on list but not detail | Field key mismatch | `dashboard-functional.test.js` detail highlights |
