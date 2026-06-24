# Print Layout (A4 Landscape)

## Overview

CubeSync supports printing both the original and glassmorphic forms directly from the browser. By default, forms can span multiple pages depending on the amount of data entered. However, to support standard filing and compact representation, the print layout is heavily optimized to fit onto a **single A4 landscape sheet** as much as possible.

## Implementation Details

The print styles are defined in `@media print` blocks within `css/styles.css` (for the original template) and `css/glassmorphic.css` (for the glassmorphic template). 

Key techniques used to enforce the single-page constraint:

1. **Page Margins (`@page`)**
   The page margin is strictly reduced to maximize printable area:
   ```css
   @page {
     size: A4 landscape;
     margin: 5mm;
   }
   ```

2. **Scaling (`zoom`)**
   The entire `body` is slightly scaled down using `zoom: 0.95` during print. This gracefully reduces the size of all elements, providing extra horizontal and vertical space without modifying specific layout rules manually.

3. **Page Break Avoidance (`page-break-inside`)**
   The main `.sheet` container uses `page-break-inside: avoid;`. This signals the browser print engine to try its best to keep the entire form bounded within a single page boundary before bleeding over to the next page.

4. **Compact Dimensions**
   Several UI components have their `padding`, `margin`, and `min-height` significantly reduced when printing:
   - Header area (`.form-header`) and headings (`h1`).
   - Request field rows (`.field-row`) and text inputs.
   - Result table (`.results-table th`, `.results-table td`).
   - The SVG barcode preview (`.barcode-preview`).

5. **Hidden Elements**
   Non-printable interactive elements are explicitly hidden using `display: none`:
   - Page tools (`.page-tools`)
   - Form actions/buttons (`.form-actions`)
   - Step controls (`.step-controls`, `.form-steps`)

## Maintenance

When adding new fields or expanding the results table, ensure that the heights remain proportional. If a form is filled with an exceptionally large number of result rows, it may still overflow the single A4 sheet limit since the browser cannot compress rows infinitely. The print styles attempt to handle the *majority* of typical forms gracefully.
