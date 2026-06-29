# Dynamic Shared Dropdown Options

Autocomplete suggestions for the dropdown-backed fields are no longer browser-local. A shared store in Firestore makes new values appear for **everyone**, and a flagged value is **promoted to the canonical list when its form is set to Ready**. Staff can also edit the lists directly from a GUI.

This complements the review logic in [free-text-dropdown-highlighting.md](free-text-dropdown-highlighting.md).

## Where options come from

The autocomplete merges three sources (de-duplicated, in this order):

1. **Deployed files** — `dropdown-options/*.txt` (static baseline, shipped with the build).
2. **Shared Firestore options** — `settings/dropdownOptions` (dynamic, edited at runtime).
3. **Browser-local** — `localStorage` (this browser only; a convenience fallback).

The dashboard's free-text review (`resolveFreeTextDropdownFields`) treats sources 1 + 2 as canonical, so a promoted value stops being flagged. It still ignores `localStorage` so judgments stay consistent across machines.

## Firestore store (`firestore.js`)

Doc: **`settings/dropdownOptions`** = `{ <field>: string[], …, updatedAt }` over the eight `DROPDOWN_OPTION_FIELDS`.

| Method | Purpose |
|--------|---------|
| `getDropdownOptions()` | Read the shared lists (returns `{ field: string[] }`). |
| `addDropdownOptions(valuesByField)` | Append values without duplicates (`arrayUnion`). Used by promotion. Accepts `{ field: value }` or `{ field: [values] }`. |
| `saveDropdownOptions(optionsByField)` | Replace the lists wholesale. Used by the manage-lists GUI. |

All three delegate their normalization (field whitelist, trim, blank-drop, case-insensitive de-dupe) to unit-testable helpers in `cubesync-form-data.js` — `readSharedDropdownOptions`, `buildSharedDropdownAddValues`, `buildSharedDropdownSaveValues` (built on `normalizeDropdownOptionList`). That module loads before `firestore.js` on every page that calls these.

### Security (`firestore.rules`)

```
match /settings/dropdownOptions {
  allow get: if true;                 // public read
  allow list: if false;
  allow create, update: if isCubeSyncStaff() && isValidDropdownOptions(...);
  allow delete: if false;
}
```

**Public read is intentional and not a leak:** the deployed `dropdown-options/*.txt` files are already served publicly, so this doc exposes the same class of data. Writes remain staff-only. `isValidDropdownOptions` restricts keys to the known fields and caps each list at 5000 entries.

## Who wires the autocomplete (the 4th-argument rule)

`setupAutocomplete(name, url, storageKey, extraOptions)` (`cubesync-autocomplete.js`) merges three sources into the suggestion list: the deployed file (`url`), `localStorage[storageKey]`, **and `extraOptions`** — the shared Firestore list. **If a caller omits `extraOptions`, managed/promoted values silently never appear for that surface.**

There are **two** independent callers, and both must pass the shared options:

| Surface | File | Inputs | How it gets `extraOptions` |
|---------|------|--------|----------------------------|
| Customer form | `app.js` (`index.html`, `glassmorphic.html`) | the public request form | `getDropdownOptions()` on load → `shared[field]` |
| Dashboard editor | `dashboard.js` (`#editForm`) | staff edit/view dialog | `state.dropdownOptions[field]`, populated by `loadDropdownOptionSets()` |

`setupAutocomplete` is **re-entrant**: it stores the merged list on the input (`input.erpAutocompleteOptions`) and `renderDropdown` reads it live, so calling it again refreshes suggestions in place without stacking duplicate event listeners. The dashboard relies on this to re-wire after `loadDropdownOptionSets()` (sign-in) and after a Manage-autocomplete save, without rebuilding the editor.

## Public form (`app.js`, `cubesync-autocomplete.js`)

On load, the form reads `getDropdownOptions()` once and passes each field's shared array as the 4th argument to `setupAutocomplete(name, url, storageKey, extraOptions)`. The customer form never writes the store — new values are only promoted by staff.

## Regression: managed values missing from the dashboard editor

**Symptom:** a value added in **Manage autocomplete** saved fine and appeared on the customer form, but **not** in the dashboard's edit/view form.

**Root cause:** the editor wired its inputs with only three arguments — `setupAutocomplete('supplier', 'dropdown-options/supplier.txt', 'savedSuppliers')` — dropping `extraOptions`. So the editor only ever saw the deployed `.txt` files plus that browser's `localStorage`; the shared Firestore layer was never merged in. The customer form (`app.js`) passed the 4th argument and worked, which masked the gap.

**Why tests missed it:** the dashboard functional tests injected `dashboard.js` **without** `cubesync-autocomplete.js`, so `window.CubeSyncAutocomplete` was undefined and the wiring fell back to a no-op stub — the autocomplete path was never exercised.

**Fix:**
- `dashboard.js` wires the editor through `wireEditFormAutocomplete()`, which passes `state.dropdownOptions[field]` as `extraOptions`, and re-runs it after `loadDropdownOptionSets()` and after each Manage-autocomplete save.
- `cubesync-autocomplete.js` made re-entrant (live `input.erpAutocompleteOptions`) so re-wiring refreshes without duplicate listeners.
- `sw.js` cache bumped (`cubesync-v6` → `cubesync-v7`) so returning clients drop the stale cached `dashboard.js`/`app.js`/`cubesync-autocomplete.js` and pick up the fix. **Any change to a precached asset must bump `CACHE_NAME`**, or stale-while-revalidate keeps serving the old file for at least one more load.

## Promote-on-Ready (`dashboard.js`)

When a form is saved with **status = Ready**, `promoteFlaggedDropdownValues()` runs:

1. `collectFlaggedDropdownValues(payload, state.dropdownOptions, metadata)` (in `cubesync-form-data.js`) returns `{ field: value }` for every dropdown field still flagged as free text with a non-empty value.
2. `addDropdownOptions(values)` appends them to the shared lists.

Promotion is **best-effort** — a failure is logged (and verified by a test) but never blocks the save. After promoting, `saveEditedForm` re-runs `loadDropdownOptionSets()` so `state.dropdownOptions` includes the new value, and the subsequent `loadForms()` reload no longer flags it (without needing a full page refresh).

## Manage-lists GUI (`dashboard.js`, `#optionsDialog`)

The dashboard menu's **“Manage autocomplete lists”** opens a dialog with one textarea per field (one value per line), pre-filled from `getDropdownOptions()`. Saving calls `saveDropdownOptions()` (whole-list replace) and reloads. Deployed-file options are always merged on top, so the GUI manages only the dynamic layer.

## Tests

| Layer | File | What it covers |
|-------|------|----------------|
| Promotion helper | `form-data.test.js` | `collectFlaggedDropdownValues` — flagged values, alias resolution, empty/none cases |
| Normalization rules | `form-data.test.js` | `normalizeDropdownOptionList`, `readSharedDropdownOptions`, `buildSharedDropdownAddValues`, `buildSharedDropdownSaveValues` — trim, blank-drop, case-insensitive de-dupe, field whitelist, single-vs-array |
| Store + rules | `firestore.test.js` | Store exports, `arrayUnion`, delegation to the form-data helpers, `settings/dropdownOptions` rule (public read, staff write) |
| Public form | `app-functional.test.js` | Shared Firestore options merge into the autocomplete dropdown |
| Re-entrancy | `autocomplete.test.js` | Re-invoking `setupAutocomplete` refreshes the live option list without duplicating the dropdown/listeners |
| Dashboard editor | `dashboard-functional.test.js` | The edit form's autocomplete includes managed (shared) suggestions — injects the real `cubesync-autocomplete.js`, so the wiring is actually exercised |
| Promotion | `dashboard-functional.test.js` | Setting a flagged form to Ready calls `addDropdownOptions` with its free-text values |
| Promotion resilience | `dashboard-functional.test.js` | The save still succeeds when `addDropdownOptions` throws (best-effort) |
| Promotion → review | `dashboard-functional.test.js` | A promoted value is no longer flagged after the reload |
| GUI | `dashboard-functional.test.js` | Manager loads current lists and saves parsed per-field arrays |
