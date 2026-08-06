# Classic Form Results Table and Print Layout

## Purpose

This document explains the classic form (`index.html`) width and printing defects fixed in August 2026. It covers the symptoms, root causes, implementation, and regression checks needed when changing result columns or barcode rendering.

## Symptoms

The defects appeared related but came from several independent layout rules:

- The form briefly appeared full-width under the loading throbber, then became narrow.
- Enabled result columns occupied only the left side of the results section, leaving blank space on the right.
- A horizontal scrollbar pushed later columns off-screen.
- Printed output clipped later columns instead of fitting them within A4 landscape.
- Barcode SVGs enlarged their cells and overlapped adjacent rows or columns.
- The Botpress launcher and proactive-message bubble appeared during printing.
- A rebuilt source stylesheet appeared correct, but the live preview still served an older generated copy.

## Root Causes and Fixes

| Problem | Root cause | Fix |
|---|---|---|
| Form narrowed after loading | `.sheet` was capped at `1180px` once the stylesheet finished loading. | The classic sheet now uses `width: calc(100vw - 24px)`. |
| Blank space after visible result columns | Field configuration hid `<th>` and `<td>` elements but left their `<colgroup>` tracks active. | Every result `<col>` now has the same `data-result-field` as its header and cells. `applyResultFieldState()` hides the matching track too. |
| Horizontal scrollbar and off-screen columns | `.results-table` had `min-width: 1440px`, and `.table-wrap` used horizontal scrolling. | The table now uses `width: 100%`, `min-width: 0`, and `max-width: 100%`. The wrapper is constrained to the form and does not scroll horizontally. |
| Columns clipped in print | Wide cell contents, especially barcode SVGs, could exceed fixed table tracks. | Print cells use `min-width: 0`, hidden overflow, and inputs limited to `max-width: 100%`. The table remains fixed at the printable width. |
| Request fields stacked in print | Chrome evaluated the responsive `max-width: 860px` rules against the printable viewport, changing the three-column request grid into the mobile one-column layout. | The print stylesheet explicitly restores the desktop header, three-column request grid, and label/value column proportions. |
| Barcode overlap | The barcode cell used visible overflow, while its SVG kept its intrinsic width and the input inherited a percentage height. | Barcode cells clip overflow, inputs use automatic height, and SVGs use `width: 100%`, `max-width: 100%`, and `object-fit: contain`. |
| Barcode too tall | The preview inherited a 72px default, printed at 52px, and accumulated padding plus separate input/preview margins. | The classic preview is 28px on screen with 3px cell padding and a 2px combined gap; print uses a 30px container and a 24px SVG. |
| Botpress visible during printing | The original print selector covered only the main Webchat elements, not the current `.bpChatContainer` host, proactive bubble, and notification classes. | Print mode hides the Botpress host, FAB, Webchat, message preview, notification container, and iframe. `beforeprint`/`afterprint` also toggle `body.is-printing`. |
| Preview appeared stale | Vercel serves generated files from `public/`, but source changes had not been copied there. | Run `npm run build` after source changes. The build recreates `public/` from the root HTML, JavaScript, CSS, and static directories. |

## Current On-Screen Layout

The classic form is intentionally viewport-width:

```css
.sheet {
  width: calc(100vw - 24px);
}

.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}

.results-table {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  table-layout: fixed;
}
```

Do not restore a fixed table minimum such as `min-width: 1440px`; that recreates the horizontal scrollbar and pushes columns outside the visible form.

## Field Visibility and Column Tracks

Result-field visibility is controlled by `settings/formFieldConfig.resultFields`. A disabled field must remove all three parts of its column:

1. The `<col data-result-field="...">` track.
2. The `<th data-result-field="...">` header.
3. Every `<td data-result-field="...">` data cell.

`index.html` and `glassmorphic.html` therefore define one explicit `<col>` for every canonical result field. `cubesync-form-data.js` applies the same `hidden` state to the track, header, and cells. Hiding only the header and cells causes the remaining cells to map onto the wrong `<colgroup>` tracks and leaves unused space at the right edge.

When adding a result field:

1. Add the field to `RESULT_FIELDS` in `cubesync-form-data.js`.
2. Add a matching `<col data-result-field="fieldName">` in both form templates.
3. Add matching `data-result-field` attributes to the header and row cell markup.
4. Extend the column-track regression test in `form.test.js` if the field is not generated from the canonical list.

## Barcode Containment

Barcode SVGs have an intrinsic width based on their Code 128 pattern. That intrinsic width must never participate in table sizing.

The shared barcode stylesheet enforces containment:

```css
.barcode-cell {
  overflow: hidden;
}

.barcode-preview {
  overflow: hidden;
}

.barcode-preview svg {
  width: 100%;
  max-width: 100%;
  object-fit: contain;
}
```

The classic form sets smaller barcode variables in `css/styles.css`, including 3px cell padding, a 1px input bottom margin, and a 1px preview top margin. Its print rules hide the input and use a compact contained barcode. Keep the SVG `viewBox` and `preserveAspectRatio` attributes in `barcode.js`; CSS containment depends on them to scale without distorting the bars.

## Current Print Behavior

The classic form prints on A4 landscape with a 4mm margin. Print rules:

- Use the full printable width at normal scale.
- Preserve the same three-column request-field layout used by the on-screen form, even when Chrome applies narrow print viewport dimensions.
- Allow long forms to paginate instead of shrinking the entire sheet.
- Keep each result row together where possible.
- Repeat the result header on later pages.
- Use an 8px result-table font to fit enabled columns.
- Constrain all cells and inputs to their fixed table tracks.
- Hide action buttons, form controls, and Botpress UI.
- Scale barcode previews with `object-fit: contain` inside a 30px print container.

The `Action` column is intentionally omitted from print because it contains editing controls. Result fields disabled through field configuration remain disabled; all enabled result fields must fit within the page.

## Botpress Print Lifecycle

`app.js` uses a dedicated print lifecycle:

1. `printForm()` adds `body.is-printing` before calling `window.print()`.
2. The browser `beforeprint` event also applies the class.
3. `afterprint` removes the class after printing or cancellation.

Both `body.is-printing` and `@media print` hide these Botpress surfaces:

- `.bpFab`
- `.bpFabWrapper`
- `.bpFABMessagePreview`
- `.bpNotificationContainer`
- `.bpMessagePreview`
- `.bpMessagePreviewContainer`
- `.bpWebchat`
- `iframe[title="Botpress"]`

Botpress remains visible during normal form use. A regular browser screenshot is therefore expected to include it; the widget is removed only while print mode is active and from the printed document.

## Build and Preview Workflow

Vercel is configured with `outputDirectory: "public"`. The `public/` directory is generated output and must not be edited manually.

After changing root HTML, JavaScript, CSS, or service-worker files:

```bash
npm run build
```

The build runs `scripts/write-env.js`, recreates `public/`, and copies the current static files. If a preview still shows old behavior:

1. Compare the source file with its generated `public/` copy.
2. Rebuild.
3. Restart the preview listener if it continues serving the earlier output.
4. Confirm the stylesheet response contains the expected rule before investigating browser caches.

Incognito mode does not fix stale generated output because every browser receives the same old file from the preview server.

## Regression Verification

Run the focused checks after layout changes:

```bash
node --test form.test.js form-field-config.test.js app-functional.test.js app-unit.test.js
npm run build
```

The tests cover:

- Full-width classic sheet and results table.
- Absence of the old 1180px sheet cap and 1440px table minimum.
- Matching result fields across `<col>`, `<th>`, and `<td>` elements.
- Column-track hiding when field configuration disables a result field.
- Botpress print-mode activation and cleanup.
- Barcode containment and print sizing.

For visual verification, test both states:

1. Normal page after the loading throbber disappears.
2. Browser print preview in A4 landscape with every enabled result field visible.

Also enter a barcode value before checking; an empty barcode cell cannot reveal SVG overflow regressions.
