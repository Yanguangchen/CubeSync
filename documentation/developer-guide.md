# CubeSync Developer Guide

This guide is the operational handbook for maintaining CubeSync. It complements the feature-specific documents in this folder by explaining how the pieces fit together, how to make safe changes, and how to verify them before deployment.

## 1. Product scope

CubeSync digitizes concrete cube test request intake and processing for R.A.K. Materials Consultants. The application has three primary audiences:

| Audience | Entry points | Main tasks |
|----------|--------------|------------|
| Customers / submitters | `index.html`, `glassmorphic.html` | Submit concrete cube test request data and result rows. |
| Staff users | `dashboard.html` | Authenticate, review submissions, edit requests, manage settings, print forms, and mark records ready for automation. |
| RPA / ERP automation | `rpa-dashboard.html`, `rpa-view.html` | Read ready records, export CSV/ZIP files, and process records into downstream systems. |

The public forms are intentionally unauthenticated, but final writes go through the serverless submit API with reCAPTCHA verification. Staff and RPA pages use Google authentication and Firestore security rules.

## 2. Repository map

| Path | Purpose | Notes |
|------|---------|-------|
| `index.html` | Original PDF-faithful public request form. | Loads the shared form controller and schema modules. |
| `glassmorphic.html` | Modern stepped public request form. | Uses the same field names and Firestore payload as `index.html`. |
| `dashboard.html` | Staff dashboard shell. | Loads dashboard modules for auth, list/detail views, edit mode, settings, filters, and export. |
| `rpa-dashboard.html` | Bot-facing queue. | Optimized for predictable selectors and export workflows. |
| `rpa-view.html` | Single request read-only view for automation. | Keep selectors stable for bots. |
| `app.js` | Public form controller. | Handles steps, autocomplete, custom field rendering, validation messaging, reCAPTCHA, and submit. |
| `dashboard.js` | Staff dashboard controller. | Coordinates CRUD, status changes, settings, free-text review, metrics, heatmap, print, and auth UI. |
| `firestore.js` | Browser Firebase adapter. | Owns client SDK setup, auth helpers, allowlist, CRUD wrappers, and dropdown/settings access. |
| `cubesync-form-data.js` | Canonical schema and data helpers. | Treat this as the source of truth for request/result fields and normalization logic. |
| `cubesync-export.js` | CSV and ZIP export utilities. | Shared by dashboard and RPA queue. |
| `barcode.js` | Code 128-B encoder and SVG renderer. | Stores barcode text only; SVGs are derived client-side. |
| `api/cube-request-submit.js` | Public submit endpoint. | Verifies reCAPTCHA and writes anonymous submissions with Firebase Admin. |
| `api/dropdown-options.js` | Dropdown option API endpoint. | Supports shared autocomplete option management where deployed. |
| `scripts/write-env.js` | Build script. | Generates `env.js` and copies deployable static files to `public/`. |
| `scripts/load-env.js` | Environment loader. | Shared helper for build and validation scripts. |
| `scripts/validate-env.js` | Secret/config validator. | Checks required deployment environment values without printing secrets. |
| `dropdown-options/` | Static autocomplete seed lists. | Build copies this whole folder into `public/dropdown-options/`. |
| `css/` | Stylesheets and design tokens. | Dashboard/form/RPA styles are split by surface plus shared token files. |
| `documentation/` | Architecture, UX, security, and feature notes. | Update this folder when behavior or operational workflows change. |
| `firestore.rules` | Firestore security rules. | CubeSync rules share the file with WorkGrid rules; avoid unrelated edits. |
| `*.test.js` | Node test suites. | Unit, functional, contract, and regression coverage run with `npm test`. |

## 3. Runtime architecture

```mermaid
flowchart LR
  Submitter[Customer browser] --> PublicForm[index.html / glassmorphic.html]
  PublicForm --> App[app.js]
  App --> SubmitAPI[/api/cube-request-submit.js]
  SubmitAPI --> Recaptcha[Google reCAPTCHA verify]
  SubmitAPI --> AdminSDK[Firebase Admin SDK]
  AdminSDK --> Firestore[(Firestore cubeRequests)]

  Staff[Staff browser] --> Dashboard[dashboard.html]
  Dashboard --> DashJS[dashboard.js]
  DashJS --> ClientSDK[firestore.js]
  ClientSDK --> Auth[Google Auth]
  ClientSDK --> Firestore

  Bot[RPA bot] --> RpaQueue[rpa-dashboard.html]
  Bot --> RpaView[rpa-view.html]
  RpaQueue --> ClientSDK
  RpaView --> ClientSDK
```

Key boundaries:

- Public users never write directly to Firestore from the browser.
- Staff writes use authenticated client SDK calls and are constrained by `firestore.rules`.
- RPA automation should consume canonical field keys and documented selectors, not user-facing labels.
- Build output is generated into `public/`; source files in the repo root, `css/`, `assets/`, and `dropdown-options/` are the editable inputs.

## 4. Data model essentials

All requests are documents in `cubeRequests`. The canonical request and result field lists live in `cubesync-form-data.js`.

### Request lifecycle

| Status | Meaning | Typical actor |
|--------|---------|---------------|
| `Draft` | Newly submitted or still under staff review. | Public submit API, staff dashboard. |
| `Ready` | Reviewed and eligible for RPA/ERP processing. | Staff dashboard. |
| `Archived` | No longer active in the queue. | Staff dashboard. |

Anonymous submissions are forced to `Draft` by the API. Only authenticated staff should promote a request to `Ready`.

### Important document fields

| Field | Type | Description |
|-------|------|-------------|
| `template` | string | Public form variant such as `Original` or `Glassmorphic`. |
| `status` | string | Human review lifecycle status. |
| `results` | array | Test-result rows using `RESULT_FIELDS`. |
| `customFields` | array | Dropdown-backed fields that may need free-text review. |
| `extraFields` | map | Staff-defined custom request field values by custom field id. |
| `createdAt` / `updatedAt` | timestamp | Server-managed create/update times. |
| `rpaStatus` / `erpStatus` | string | Automation state metadata. |
| `attemptCount` | number | Automation retry metadata. |

### Settings documents

| Path | Owner | Purpose |
|------|-------|---------|
| `settings/formFieldConfig` | Staff dashboard | Enables/disables request and result fields, custom labels, and custom request fields. |
| `settings/dropdownOptions` | Staff dashboard / promotion flow | Shared autocomplete options merged with static seed files. |

## 5. Public form flow

1. The browser loads `env.js`, Firebase/browser helpers, schema helpers, autocomplete, barcode helpers, and `app.js`.
2. Cached field settings are applied early from `localStorage` so disabled fields do not block validation during async setup.
3. Fresh field settings and dropdown options are fetched when available.
4. The user enters request fields and one or more result rows.
5. Autocomplete-backed fields mark typed custom values with `data-free-text-entry="true"`; selected suggestions clear that flag.
6. `validateCubeRequestForm()` validates required visible/enabled fields and result row completeness.
7. reCAPTCHA v2 produces a token.
8. The browser posts `{ payload, recaptchaToken }` to `/api/cube-request-submit`.
9. The API verifies the token, sanitizes/validates the payload, rejects caller-supplied ids, forces `status: "Draft"`, and creates a Firestore document.

## 6. Dashboard flow

1. `dashboard.html` loads auth and dashboard modules.
2. Staff sign in with Google; `firestore.js` checks the configured allowlist.
3. The dashboard lists requests and normalizes legacy aliases for display.
4. Selecting a row opens details; free-text dropdown values are highlighted when their stored value is not in the known option set.
5. Edit mode builds a full form payload, then `buildCubeRequestUpdatePatch()` sends only changed fields.
6. Status promotion to `Ready` can also promote reviewed free-text values into shared dropdown options.
7. Field settings allow staff to enable/disable fields, rename public labels, define custom request fields, and manage shared dropdown options.

## 7. RPA and export workflow

- Use `RPA_SELECTOR_REFERENCE.md` before changing IDs, data attributes, table columns, or labels relied on by automation.
- The RPA queue should process `Ready` records, not raw `Draft` submissions.
- Export helpers generate deterministic CSV content and ZIP packages from normalized request data.
- Visible customer labels can be customized, but automation must continue to bind to canonical field keys.

## 8. Environment and configuration

### Browser/public values

| Variable | Produced file | Description |
|----------|---------------|-------------|
| `CUBESYNC_RECAPTCHA_SITE_KEY` | `env.js` / `public/env.js` | Site key consumed by public forms. |

### Server-only values

| Variable | Required for | Description |
|----------|--------------|-------------|
| `CUBESYNC_RECAPTCHA_SECRET_KEY` | `/api/cube-request-submit.js` | Secret used for Google token verification. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `/api/cube-request-submit.js` | Raw Firebase Admin service-account JSON. |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | `/api/cube-request-submit.js` | Base64 alternative for hosts where multiline JSON is fragile. |

Never commit real secret values. `env.example.js` is safe to copy for local browser testing, but real production secrets belong in the deployment platform.

## 9. Local development

```sh
npm install
npm run build
npm test
npm run lint
```

Use `vercel dev` when testing the public submit endpoint locally. Opening pages with a static server is useful for UI work, but static servers cannot execute `/api/*` functions.

Common local workflow:

1. Edit source files in the repo root, `css/`, `api/`, `scripts/`, or `documentation/`.
2. Run focused tests while iterating, for example `node --test form-data.test.js`.
3. Run `npm test` before handoff.
4. Run `npm run lint` before handoff.
5. Run `npm run build` when validating deployment output or changes to static asset copying/env generation.

## 10. Testing strategy

| Test type | What it protects | Examples |
|-----------|------------------|----------|
| Unit tests | Pure data helpers, barcode encoding, export formatting, field config logic. | `barcode.test.js`, `export.test.js`, `form-data.test.js`. |
| Functional tests | Browser flows simulated in JSDOM. | `app-functional.test.js`, `dashboard-functional.test.js`, `rpa-functional.test.js`. |
| Contract/source tests | Required selectors, deployment config, security-sensitive source structure. | `deployment-config.test.js`, `rpa-coverage-audit.test.js`, `api-handler.test.js`. |
| Regression tests | Previously fixed bugs and edge cases. | `free-text-dropdown.test.js`, `dashboard-edit.test.js`, `sw.test.js`. |

When adding behavior, prefer the smallest focused test that would fail without the change. For UI behavior, use JSDOM tests unless a browser-only API makes that impractical.

## 11. Security checklist for changes

- Do not allow anonymous clients to choose Firestore document IDs.
- Keep anonymous submissions create-only and forced to `Draft`.
- Keep reCAPTCHA verification server-side.
- Keep `CUBESYNC_ALLOWED_EMAILS` in `firestore.js` synchronized with `isCubeSyncAllowedEmail()` in `firestore.rules`.
- Do not broaden WorkGrid rules while making CubeSync-only changes.
- Validate every new persisted field in both JavaScript sanitization and Firestore rules.
- Preserve server timestamp sentinels when patching documents.
- Avoid storing generated barcode images; store barcode text only.
- Treat customer-facing custom labels as presentation only; do not use them as storage keys or selectors.

## 12. Accessibility and UX checklist

- Maintain keyboard access for forms, dashboard controls, and autocomplete menus.
- Preserve visible labels and programmatic names for inputs.
- Keep status and save messages in existing live/status regions where practical.
- Test responsive layouts when changing grids, field groups, or dashboard panes.
- Preserve print-specific CSS assumptions for A4 landscape form output.
- When changing animations, respect reduced-motion patterns where existing styles support them.

## 13. Change impact guide

| If you change... | Also check... |
|------------------|---------------|
| Canonical field names | `cubesync-form-data.js`, dashboard rendering/editing, exports, RPA selector docs, tests, Firestore rules. |
| Required fields | Public validation, API validation, field settings behavior, tests. |
| Dropdown fields/options | Static files, `settings/dropdownOptions`, free-text highlighting, promotion flow, build output. |
| Public form markup | `app.js`, CSS, print layout, autocomplete setup, reCAPTCHA container, tests. |
| Dashboard markup | `dashboard.js`, CSS, selectors, functional tests, screenshots if UI-visible. |
| RPA markup/selectors | `RPA_SELECTOR_REFERENCE.md`, RPA tests, bot-facing workflows. |
| API payload shape | API tests, Firestore rules, dashboard normalization, export helpers. |
| Service worker cache list | `sw.js`, build output, cache version, offline tests. |
| Deployment copy list | `scripts/write-env.js`, `deployment-config.test.js`, `public/` output after build. |

## 14. Deployment checklist

1. Confirm environment variables exist in Vercel.
2. Run `npm run validate-env` in an environment that has deployment variables.
3. Run `npm run build` and confirm `public/` contains HTML, JS, CSS, assets, `env.js`, and `dropdown-options/`.
4. Run `npm test` and `npm run lint`.
5. Deploy Firestore rules if rules changed.
6. Deploy the Vercel app.
7. Smoke test:
   - public form loads and renders reCAPTCHA,
   - a draft submission can be created,
   - staff sign-in works,
   - dashboard can edit and promote to `Ready`,
   - RPA queue sees ready records,
   - export downloads expected files,
   - autocomplete option files are reachable under `/dropdown-options/`.

## 15. Documentation maintenance rules

- Update `documentation/README.md` when adding or removing a document.
- Update `README.md` when setup, testing, deployment, or primary page entry points change.
- Update `RPA_SELECTOR_REFERENCE.md` before or alongside selector changes that could affect automation.
- Update `security-audit.md` when closing or discovering a security gap.
- Add feature-specific notes for behavior with non-obvious business rules, test history, or deployment caveats.
