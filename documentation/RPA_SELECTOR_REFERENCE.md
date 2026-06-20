# CubeSync RPA Selector Reference

This document lists the selectors and field names to use when configuring RPA against the CubeSync forms, dashboard, and RPA queue.

Prefer stable selectors in this order:

1. `id` selectors for single page controls.
2. `name` selectors for form data fields.
3. `data-*` selectors for behavior-specific controls.
4. Class selectors only when no stable `id`, `name`, or `data-*` selector exists.

Do not use generated barcode SVG markup as stored data. Barcodes are stored as text in Firestore and rendered into barcode previews on the client side.

## Page Entry Points

| Page | File | Purpose |
| --- | --- | --- |
| Original form | `index.html` | PDF-style concrete cube request form |
| Glassmorphic form | `glassmorphic.html` | Modern form using the same Firestore fields |
| Dashboard | `dashboard.html` | CRUD dashboard for submitted forms |
| RPA dashboard | `rpa-dashboard.html` | RPA queue and ERP status controls |
| RPA view | `rpa-view.html` | Full read-only view of all form fields and test results |

## Main Form Selectors

These apply to both the original and glassmorphic forms.

| Target | Selector | Notes |
| --- | --- | --- |
| Main form | `#cubeRequestForm` | Root form element |
| Original form | `form[data-template="Original"]` | Template identifier |
| Glassmorphic form | `form[data-template="Glassmorphic"]` | Template identifier |
| Save button | `#saveFormButton` | Submits the form to Firestore |
| Save status | `#saveStatus` | Save/auth/status text |
| Print button | `#printButton` | Prints the current form |
| Add result row button | `#addRowButton` | Adds a test result row |

Recommended RPA pattern:

```css
#cubeRequestForm [name="client"]
#cubeRequestForm [name="reportNo"]
#cubeRequestForm [data-barcode-input]
```

## Request Field Selectors

Both form designs save to the same Firestore field names.

| Field | Selector | Firestore field |
| --- | --- | --- |
| Internal date | `input[name="internalDate"]` | `internalDate` |
| Project code | `input[name="projectCode"]` | `projectCode` |
| Report number | `input[name="reportNo"]` | `reportNo` |
| Client | `input[name="client"]` | `client` |
| Method | `input[name="method"]` | `method` |
| Project | `input[name="project"]` | `project` |
| Concrete grade | `input[name="concreteGrade"]` | `concreteGrade` |
| Supplier | `input[name="supplier"]` | `supplier` |
| Location represented | `input[name="locationRepresented"]` | `locationRepresented` |
| Additional information | `input[name="additionalInformation"]` | `additionalInformation` |
| Date/time sampled | `input[name="dateTimeSampled"]` | `dateTimeSampled` |
| Slump measured | `input[name="slumpMeasured"]` | `slumpMeasured` |
| Specimen size | `select[name="specimenSize"]` | `specimenSize` |
| Slump specified | `input[name="slumpSpecified"]` | `slumpSpecified` |

## Test Result Row Selectors

Result rows are inside:

```css
.results-table tbody tr
```

Each result field uses a 1-based row suffix. For row 1:

| Field | Row 1 selector | Firestore field |
| --- | --- | --- |
| Set No | `input[name="testNumber1"]` | `results[].testNumber` |

| Date tested | `input[name="dateTested1"]` | `results[].dateTested` |
| Age in days | `input[name="ageDays1"]` | `results[].ageDays` |
| Weight in kg | `input[name="weightKg1"]` | `results[].weightKg` |
| Load in kN | `input[name="loadKn1"]` | `results[].loadKn` |
| Compressive strength | `input[name="strength1"]` | `results[].strength` |
| Mode of failure | `input[name="failureMode1"]` | `results[].failureMode` |
| Barcode text | `input[name="barcode1"][data-barcode-input]` | `results[].barcode` |

For later rows, increment the suffix:

```css
input[name="testNumber2"]
input[name="barcode2"][data-barcode-input]
input[name="testNumber3"]
input[name="barcode3"][data-barcode-input]
```

Useful generic selectors:

```css
.results-table tbody tr
.results-table [data-barcode-input]
.results-table tbody tr:nth-child(3) input[name="barcode3"]
```

## Barcode Handling

Use the barcode input value as the source of truth:

```css
input[data-barcode-input]
```

Do not store or scrape:

```css
.barcode-preview svg
.barcode-preview img
```

The barcode preview is generated client-side from the text value. Firestore stores only the text field:

```js
results[].barcode
```

## Glassmorphic Step Selectors

These selectors exist only on `glassmorphic.html`.

| Target | Selector |
| --- | --- |
| Step navigation | `.form-steps` |
| Step 1 button | `.step-indicator[data-step="1"]` |
| Step 2 button | `.step-indicator[data-step="2"]` |
| Step 1 content | `.form-step[data-step="1"]` |
| Step 2 content | `.form-step[data-step="2"]` |
| Previous step button | `#prevStep` |
| Next step button | `#nextStep` |
| Step controls wrapper | `.step-controls` |

## Dashboard Selectors

These selectors apply to `dashboard.html`.

### Authentication

| Target | Selector |
| --- | --- |
| Authentication gate | `#authGate` |
| Google sign-in button | `#signInButton` |
| Dashboard shell | `#dashboardShell` |
| Signed-in user display | `#authUser` |
| Sign-out button | `#signOutButton` |

### Dashboard Controls

| Target | Selector |
| --- | --- |
| Form list body | `#formList` |
| Detail panel | `#detailPanel` |
| Detail title | `#detailTitle` |
| Detail content | `#detailContent` |
| Search input | `#searchInput` |
| Status filter | `#statusFilter` |
| Selected row | `.form-table tbody tr.selected` |

### Free-text review indicators

Rows and fields flagged when a dropdown-backed value was typed instead of selected from the autocomplete list.

| Target | Selector |
| --- | --- |
| Flagged list row | `.form-table tbody tr.has-custom-fields` |
| Free-text count badge | `.custom-field-count` |
| Detail legend | `.custom-field-legend` |
| Flagged detail field | `.detail-field.is-custom-field` |
| Highlighted value | `.highlight-custom` |

See [free-text-dropdown-highlighting.md](free-text-dropdown-highlighting.md).

### Row Action Buttons

| Action | Selector |
| --- | --- |
| View | `button[data-action="view"]` |
| Edit | `button[data-action="edit"]` |
| Print | `button[data-action="print"]` |
| Delete | `button[data-action="delete"]` |

### Edit Dialog

| Target | Selector |
| --- | --- |
| Dialog | `#editDialog` |
| Edit form | `#editForm` |
| Close editor | `#closeEditorButton` |
| Cancel edit | `#cancelEditButton` |
| Hidden document ID | `#editForm [name="id"]` |
| Report number | `#editForm [name="reportNo"]` |
| Status | `#editForm [name="status"]` |
| Client | `#editForm [name="client"]` |
| Project | `#editForm [name="project"]` |
| Grade | `#editForm [name="grade"]` |
| Template | `#editForm [name="template"]` |
| Location | `#editForm [name="location"]` |
| Notes | `#editForm [name="notes"]` |

### Detail Action Buttons

| Action | Selector |
| --- | --- |
| View selected form | `#detailViewButton` |
| Edit selected form | `#detailEditButton` |
| Print selected form | `#detailPrintButton` |
| Delete selected form | `#detailDeleteButton` |
| Print area | `#printArea` |

## RPA Dashboard Selectors

These selectors apply to `rpa-dashboard.html`.

| Target | Selector |
| --- | --- |
| Queue list body | `#queueList` |
| Previous day button | `#prevDay` |
| Today button | `#todayBtn` |
| Next day button | `#nextDay` |
| Date picker | `#datePicker` |
| Current date display | `#currentDateDisplay` |
| Export all CSV button | `#exportAllButton` |
| ERP selector | `select[data-action="update-erp"]` |
| ERP selector class | `.erp-selector` |
| Open form button | `button[data-action="open"]` |
| Disable/enable RPA button | `button[data-action="toggle-disable"]` |
| Disabled queue row | `.disabled-row` |

## RPA View Selectors

These selectors apply to `rpa-view.html`.

| Target | Selector |
| --- | --- |
| Report number display | `#reportNoDisplay` |
| Submitted/updated date display | `#submittedAtDisplay` |
| View status message | `#viewMessage` |
| Status badge | `#statusBadge` |
| Disable/enable RPA button | `#btnDisable` |
| Form fields grid | `#formFieldsGrid` |
| Results table header | `#resultsHeader` |
| Results table body | `#resultsBody` |
| Form field item | `.rpa-field` |
| Form field label | `.rpa-label` |
| Form field value | `.rpa-value` |
| Results table | `.rpa-results-table` |
| Generated barcode preview | `.rpa-barcode-preview` |

## Visual Classes

These classes are useful for layout checks, but they are less stable than `id`, `name`, and `data-*` selectors.

```css
.page-tools
.tool-section.left
.tool-section.center
.tool-section.right
.mode-toggle
.version-link
.sheet
.form-header
.brand
.contact-block
.internal-use
.request-grid
.field-row
.field-row.short
.field-row.full
.results-section
.results-header
.table-wrap
.results-table
.barcode-cell
.barcode-preview
.barcode-placeholder
.barcode-message
.barcode-error
.remove-row-btn
```

Column classes:

```css
.col-test-number
.col-marking
.col-date-tested
.col-age
.col-weight
.col-load
.col-strength
.col-failure
.col-barcode
```

## Firestore Data Shape

All saved forms go to the same Firestore collection:

```js
cubeRequests
```

Top-level request fields:

```js
internalDate
projectCode
reportNo
client
method
project
concreteGrade
supplier
locationRepresented
additionalInformation
dateTimeSampled
slumpMeasured
specimenSize
slumpSpecified
template
status
results
```

Each `results` item contains:

```js
testNumber

dateTested
ageDays
weightKg
loadKn
strength
failureMode
barcode
```

## RPA Configuration Notes

- Use `#cubeRequestForm [name="fieldName"]` for form fields.
- Use `.results-table tbody tr` to iterate result rows.
- Use `[data-barcode-input]` to read or write barcode text.
- Use `form[data-template="Original"]` or `form[data-template="Glassmorphic"]` only when the RPA flow needs to distinguish the form version.
- Avoid relying on `.barcode-preview` for data extraction. It is a generated display area only.
- Avoid relying on visual classes for critical automation unless no stable selector exists.
