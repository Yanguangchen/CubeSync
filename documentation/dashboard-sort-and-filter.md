# Dashboard Sort & Filter

The Human Dashboard (`dashboard.html`) form list can be **sorted by date** and **filtered by Client and Project**, in addition to the existing free-text **Search** box and **Status** filter. All controls live in the `.filters` block of the list panel and present as dropdown `<select>`s.

> Client and Project are the autocomplete-backed fields on the request forms, so on the dashboard they are exposed as **dropdown selectors** whose options are the distinct values present in the loaded forms.

## Controls

| Control | id | Behaviour |
|---------|-----|-----------|
| Search | `searchInput` | Substring match across report no., client, project, grade, and barcodes |
| Status | `statusFilter` | `all` / `Draft` / `Ready` / `Archived` |
| Client | `clientFilter` | `all` or one distinct client value (exact, case-insensitive) |
| Project | `projectFilter` | `all` or one distinct project value (exact, case-insensitive) |
| Sort | `sortOrder` | `date-desc` (newest first, default) or `date-asc` (oldest first) |
| Today only | `todayOnlyToggle` | When on, keeps only forms whose `updatedAt` is the current local date |

All controls compose: the list shows forms matching **every** active filter, in the chosen sort order.

### "Today only" tactile switch

The Today-only control is a glass tactile switch (`#todayToggle`) backed by a real, visually-hidden checkbox (`#todayOnlyToggle`) that is the single source of truth. The glass animation engine lives in `cubesync-today-toggle.js` (`window.CubeSyncTodayToggle.setup`). When the engine can't run (no `<canvas>`, e.g. JSDOM/old browsers) the container gets `.is-basic` and a CSS-only `:checked` fallback drives the thumb — the checkbox, and therefore the filter, works either way. Styles live in `css/dashboard/today-toggle.css`.

## Logic module (`cubesync-dashboard-filters.js`)

The filtering/sorting logic is a pure UMD module exposed as `window.CubeSyncDashboardFilters`, kept separate from `dashboard.js` so it can be unit-tested without a DOM.

| Function | Purpose |
|----------|---------|
| `parseDateKey(value)` | Parse a date string into a comparable `YYYYMMDD` integer. Accepts ISO (`2026-06-24`, `2026/06/24`) and day-first (`24/06/2026`, `24-06-2026`). Returns `NaN` for empty/unparseable input. |
| `collectFilterOptions(forms)` | Return `{ clients, projects }` — distinct, trimmed, case-insensitively de-duplicated, alphabetically sorted values for the dropdowns. |
| `currentIsoDate(now?)` | Local date as `YYYY-MM-DD` — the default reference for the today filter. |
| `applyDashboardFilters(forms, criteria)` | Filter by `search` / `status` / `client` / `project` / `todayOnly`, then sort by date. Returns a **new** array; never mutates the input. `criteria = { search, status, client, project, sort, todayOnly, today }`. |

### Rules

- **Facet match** (Client/Project): a value of `"all"`, `""`, or missing means "no filter". Otherwise the match is exact after trim + lowercase, so casing/whitespace differences in stored data do not hide rows.
- **Today only**: when `todayOnly` is set, a form is kept only if `parseDateKey(form.updatedAt)` equals the reference day (`criteria.today`, or `currentIsoDate()` if omitted). Mixed date formats compare correctly via `parseDateKey`.
- **Date sort key**: derived from each form's `updatedAt`. Forms with no parseable date sort to the **end** regardless of direction (treated as `-Infinity`).
- **Search parity**: the search text still includes barcodes from `raw.results`, matching the dashboard's prior behaviour.

## Dashboard wiring (`dashboard.js`)

- `state` gains `client`, `project`, and `sort` (default `"date-desc"`).
- `filteredForms()` delegates to `applyDashboardFilters()` when the helper is loaded, and **falls back** to the legacy search + status filter if it is not — so the dashboard degrades gracefully if the script is missing.
- `refreshFilterOptions()` runs after `loadForms()` and repopulates the Client/Project dropdowns via `populateFilterSelect()`, preserving the current selection when it still matches a loaded form (otherwise resetting to `all`).
- `change` listeners on `clientFilter`, `projectFilter`, `sortOrder`, and `todayOnlyToggle` update `state` and re-render the list. `state.todayOnly` defaults to `false`; the current day is supplied to the filter via `helper.currentIsoDate()`.
- `CubeSyncTodayToggle.setup(elements.todayToggle)` initialises the glass switch on load (no-op-safe if the script is absent).

## Tests

| Layer | File | What it guards |
|-------|------|----------------|
| Unit | `dashboard-filters.test.js` | `parseDateKey` formats, `collectFilterOptions` de-dupe/sort, `applyDashboardFilters` facet filtering, combined filters, barcode search, date sort (both directions, mixed formats, undated-last), no-mutation |
| Integration | `dashboard-functional.test.js` | Dropdowns populate with distinct sorted values; sort + Client + Project changes re-order/filter the rendered rows end-to-end |

Run with `npm test`.
