# CubeSync — Concrete Cube Test Request System

Digital submission and management platform for concrete cube test requests. Replaces the paper-based `Concrete Cube Request Form_e-Form.pdf` with a web application backed by Firebase Firestore.

## Pages

| Page | File | Purpose |
|------|------|---------|
| Original form | `index.html` | PDF-faithful concrete cube request form |
| Glassmorphic form | `glassmorphic.html` | Modern stepped form with the same Firestore fields |
| Human dashboard | `dashboard.html` | CRUD dashboard — view, edit, print, delete submitted forms |
| RPA queue | `rpa-dashboard.html` | Bot-facing queue filtered by date, with CSV/ZIP export |
| RPA form view | `rpa-view.html` | Read-only single-form view for RPA bots |

Open any page directly in a browser — no build step required.

## Architecture

```
Browser pages (HTML)
  ├── glassmorphic.html / index.html ──→ app.js (form controller)
  ├── dashboard.html ──────────────────→ dashboard.js (CRUD controller)
  ├── rpa-dashboard.html ──────────────→ rpa-dashboard.js (queue controller)
  └── rpa-view.html ───────────────────→ rpa-view.js (single-form viewer)

Shared modules (loaded via <script>)
  ├── barcode.js ──────→ Code 128-B encoder + SVG renderer
  ├── cubesync-form-data.js ──→ Schema, serialization, normalization
  ├── cubesync-export.js ─────→ CSV builder + ZIP packager
  └── firestore.js ───────────→ Firebase Auth + Firestore CRUD
```

All shared modules use UMD (browser `window.*` + CommonJS `module.exports`) except `firestore.js` which uses ES module imports from the Firebase CDN.

### Global APIs

| Global | Source | Purpose |
|--------|--------|---------|
| `window.CubeSyncBarcode` | `barcode.js` | `encodeCode128B`, `renderBarcodeSvg`, `sanitizeBarcodeText` |
| `window.CubeSyncFormData` | `cubesync-form-data.js` | `buildCubeRequestFromForm`, `normalizeCubeRequestForDashboard`, `dashboardEditToCubeRequest`, `FORM_FIELDS`, `RESULT_FIELDS` |
| `window.CubeSyncExport` | `cubesync-export.js` | `buildExportFiles`, `buildFormCsv`, `createZipBlob`, `downloadFilesAsZip` |
| `window.CubeSyncFirestore` | `firestore.js` | `listCubeRequests`, `getCubeRequest`, `saveCubeRequest`, `updateCubeRequest`, `deleteCubeRequest` |
| `window.CubeSyncAuth` | `firestore.js` | `onAuthChange`, `currentUser`, `isAllowedEmail`, `isAllowedUser`, `signInWithGoogle`, `signOutUser` |

## Data schema

All forms are stored in the `cubeRequests` Firestore collection.

**Request fields** (14): `internalDate`, `projectCode`, `reportNo`, `client`, `method`, `project`, `concreteGrade`, `supplier`, `locationRepresented`, `additionalInformation`, `dateTimeSampled`, `slumpMeasured`, `specimenSize`, `slumpSpecified`

**Result fields** (9 per row): `testNumber`, `clientCubeMarking`, `dateTested`, `ageDays`, `weightKg`, `loadKn`, `strength`, `failureMode`, `barcode`

**System fields**: `template`, `status`, `createdAt`, `updatedAt`, `rpaStatus`, `erpStatus`, `attemptCount`

Barcodes are stored as **text only** — SVGs are rendered client-side via Code 128-B encoding. Never store generated barcode images in Firestore.

## Barcodes

Enter text in any barcode field and a Code 128-B barcode is generated automatically. The encoder validates printable ASCII (chars 32–126), computes a weighted checksum, and renders an accessible `<svg>` with `role="img"` and `aria-label`.

## Development

No build tools are required. Static files are served directly.

```sh
# Install dev dependencies (testing + linting only)
npm install

# Run the test suite (Node.js built-in test runner)
npm test

# Lint with ESLint
npm run lint
```

### Test suite

The project uses `node:test` + `node:assert/strict` with `jsdom` for DOM simulation. Tests are organized in three tiers:

| Tier | Pattern | Example |
|------|---------|---------|
| Unit tests | Pure function → assert output | `barcode.test.js`, `export.test.js` |
| Functional tests | JSDOM + mocked Firebase → simulate clicks → assert DOM | `app-functional.test.js`, `dashboard-functional.test.js` |
| Contract tests | Read source as string → regex assertions on structure | `form.test.js`, `firestore.test.js` |

## Firestore rules safety

`firestore.rules` also contains WorkGrid rules from another sensitive app. **Do not edit the WorkGrid rule blocks** for CubeSync work.

CubeSync-specific access must stay in the clearly marked `CUBESYNC-ONLY RULES` block for `cubeRequests`. That block allows read/write for authenticated Firebase users; dashboard access is further gated by the Google sign-in allowlist.

The allowlist is maintained in `firestore.js` as `CUBESYNC_ALLOWED_EMAILS`. It mirrors the WorkGrid-listed emails plus CubeSync additions such as `ernestngcy@gmail.com`; do not add CubeSync-only users by editing WorkGrid rule code.

## Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | This file — project overview and quick start |
| `design.md` | Design system: palette, tokens, typography, components |
| `architecture.md` | UML diagrams: class, sequence, component, state, and data model |
| `RPA_SELECTOR_REFERENCE.md` | Stable CSS selectors and field names for RPA automation |

## Deployment

Hosted on Vercel as a static site. Push to `main` to deploy.
