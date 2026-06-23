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

All three normalize entries (trim + case-insensitive de-dupe).

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

## Public form (`app.js`, `cubesync-autocomplete.js`)

On load, the form reads `getDropdownOptions()` once and passes each field's shared array as the new 4th argument to `setupAutocomplete(name, url, storageKey, extraOptions)`. The customer form never writes the store — new values are only promoted by staff.

## Promote-on-Ready (`dashboard.js`)

When a form is saved with **status = Ready**, `promoteFlaggedDropdownValues()` runs:

1. `collectFlaggedDropdownValues(payload, state.dropdownOptions, metadata)` (in `cubesync-form-data.js`) returns `{ field: value }` for every dropdown field still flagged as free text with a non-empty value.
2. `addDropdownOptions(values)` appends them to the shared lists.

Promotion is **best-effort** — a failure is logged and never blocks the save. After saving, `loadForms()` re-merges the shared options so the just-promoted value is no longer flagged.

## Manage-lists GUI (`dashboard.js`, `#optionsDialog`)

The dashboard menu's **“Manage autocomplete lists”** opens a dialog with one textarea per field (one value per line), pre-filled from `getDropdownOptions()`. Saving calls `saveDropdownOptions()` (whole-list replace) and reloads. Deployed-file options are always merged on top, so the GUI manages only the dynamic layer.

## Tests

| Layer | File | What it covers |
|-------|------|----------------|
| Promotion helper | `form-data.test.js` | `collectFlaggedDropdownValues` — flagged values, alias resolution, empty/none cases |
| Store + rules | `firestore.test.js` | `getDropdownOptions` / `addDropdownOptions` / `saveDropdownOptions` exports, `arrayUnion`, `settings/dropdownOptions` rule (public read, staff write) |
| Public form | `app-functional.test.js` | Shared Firestore options merge into the autocomplete dropdown |
| Promotion | `dashboard-functional.test.js` | Setting a flagged form to Ready calls `addDropdownOptions` with its free-text values |
| GUI | `dashboard-functional.test.js` | Manager loads current lists and saves parsed per-field arrays |
