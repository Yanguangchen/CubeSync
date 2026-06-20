# CubeSync Architecture Overview

High-level summary of the CubeSync system. For comprehensive UML diagrams (component, class/module, sequence, state, ER, and security boundary), see [project-uml.md](project-uml.md).

## System overview

CubeSync digitizes the paper concrete cube request process. It includes public submission forms, a staff dashboard, an RPA queue, and a serverless API for secure customer writes.

## Core components

### Frontend pages

| Page | File | Controller | Purpose |
|------|------|------------|---------|
| Original form | `index.html` | `app.js` | PDF-faithful request form |
| Glassmorphic form | `glassmorphic.html` | `app.js` | Stepped request form |
| Human dashboard | `dashboard.html` | `dashboard.js` | Staff CRUD, field settings, free-text review |
| RPA queue | `rpa-dashboard.html` | `rpa-dashboard.js` | Date-filtered bot queue, CSV/ZIP export |
| RPA form view | `rpa-view.html` | `rpa-view.js` | Read-only single form for bots |

### Shared modules (UMD except `firestore.js`)

| Module | Role |
|--------|------|
| `barcode.js` | Code 128-B encode + SVG render |
| `cubesync-autocomplete.js` | Autocomplete dropdown functionality for ERP and other data fields |
| `cubesync-table-manager.js` | Manages dynamic test results rows, age calculation, and field prefilling |
| `cubesync-form-data.js` | Schema, validation, field config, serialization, dashboard normalization, free-text helpers, patch updates |
| `cubesync-export.js` | CSV + ZIP export |
| `cubesync-form-markup.js` | Shared result-row HTML for forms and dashboard editor |
| `firestore.js` | Firebase Auth + Firestore client (ES modules from CDN) |

### Backend

| Component | Role |
|-----------|------|
| `/api/cube-request-submit.js` | reCAPTCHA verify → Admin SDK write to `cubeRequests` |
| `firestore.rules` | WorkGrid rules + CubeSync-only block (`cubeRequests`, `settings/formFieldConfig`) |

## Security model

| Audience | Access | Protection |
|----------|--------|------------|
| Public (customer) | Submit forms | reCAPTCHA v2 + API proxy (no direct Firestore write) |
| Staff | Dashboard, RPA | Google OAuth + `CUBESYNC_ALLOWED_EMAILS` (UI) + `isCubeSyncStaff()` (Firestore rules) |

Keep `firestore.js` and `firestore.rules` allowlists in sync.

## Data flow

1. **Submission:** User fills form → `app.js` builds payload (including `customFields`, `extraFields`) → reCAPTCHA → POST `/api/cube-request-submit` → Firestore.
2. **Management:** Staff signs in → dashboard loads option lists + forms → view/edit/delete → patch update to Firestore.
3. **Review:** Dashboard merges `customFields` metadata with value-based free-text derivation → orange highlights on list and detail.
4. **Automation:** RPA loads queue → exports CSV/ZIP or updates `rpaStatus` / `erpStatus`.

## Configuration

Staff use **Field settings** on the dashboard to:

- Enable/disable request fields and result columns on public forms.
- Rename labels on public forms (`requestLabels`, `resultLabels`).
- Add/edit/delete custom request fields (`customRequestFields` → `extraFields` on each request).

Label overrides are intentionally public-form-only. Dashboard, RPA queue/view, exports, selectors, and Firestore keys stay on canonical field names so internal operations and bot automation remain stable.

Config document: `settings/formFieldConfig`. Cached locally as `cubesync-form-field-config`.

## Further reading

- [README.md](README.md) — schema, build, deploy, testing
- [design.md](design.md) — design tokens and UI patterns
- [free-text-dropdown-highlighting.md](free-text-dropdown-highlighting.md) — free-text review flags
- [RPA_SELECTOR_REFERENCE.md](RPA_SELECTOR_REFERENCE.md) — stable selectors for automation
