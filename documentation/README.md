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

Open any page directly in a browser for local development. Customer-facing submissions use reCAPTCHA v2 and a serverless API when `env.js` provides a site key.

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
  └── firestore.js ───────────→ Firebase Auth + Firestore CRUD/API client
```

All shared modules use UMD (browser `window.*` + CommonJS `module.exports`) except `firestore.js` which uses ES module imports from the Firebase CDN.

### Project layout

| Path | Contents |
|------|----------|
| `css/` | All stylesheets — entry files (`styles.css`, `glassmorphic.css`, `dashboard.css`, …) plus `shared/`, `dashboard/`, and `rpa/` partials |
| `documentation/` | Project docs (`README.md`, `design.md`, `architecture.md`, `overview.md`, `RPA_SELECTOR_REFERENCE.md`) |
| `scripts/` | Build and env helpers (`write-env.js`, `load-env.js`) |
| `api/` | Vercel serverless handlers |
| `assets/` | Logos, icons, XP theme images |
| `public/` | Generated deploy output (`npm run build`) — do not edit by hand |

The repo root keeps a short [README.md](../README.md) that links here.

### Global APIs

| Global | Source | Purpose |
|--------|--------|---------|
| `window.CubeSyncBarcode` | `barcode.js` | `encodeCode128B`, `renderBarcodeSvg`, `sanitizeBarcodeText` |
| `window.CubeSyncFormData` | `cubesync-form-data.js` | Schema, validation, `buildCubeRequestFromForm`, `applyFormFieldConfig`, `syncNativeFormConstraints`, `validateCubeRequestForm`, `normalizeCubeRequestForDashboard` |
| `window.CubeSyncExport` | `cubesync-export.js` | `buildExportFiles`, `buildFormCsv`, `createZipBlob`, `downloadFilesAsZip` |
| `window.CubeSyncFirestore` | `firestore.js` | `savePublicCubeRequest`, `listCubeRequests`, `getCubeRequest`, `saveCubeRequest`, `updateCubeRequest`, `deleteCubeRequest`, `getFormFieldConfig`, `saveFormFieldConfig` |
| `window.CubeSyncAuth` | `firestore.js` | `onAuthChange`, `currentUser`, `isAllowedEmail`, `isAllowedUser`, `signInWithGoogle`, `signOutUser` |

## reCAPTCHA v2 Integration

The CubeSync system uses Google reCAPTCHA v2 to protect the public submission API from automated spam. This integration consists of three main parts:

### 1. Client-Side Rendering (`app.js`)
The `renderRecaptcha` function in `app.js` is responsible for initializing the widget:
- **Automatic Loading:** The script polls for `window.grecaptcha` up to 20 times with a 250ms delay (5 seconds total). If the reCAPTCHA library fails to load within this window, it stops and can be retried.
- **Site Key:** The site key is dynamically loaded from `window.CubeSyncEnv.RECAPTCHA_SITE_KEY`, which is generated during the build process.
- **Validation:** Before submission, `recaptchaToken()` ensures the user has completed the challenge. It throws descriptive errors if the widget hasn't loaded or if the response is missing.

### 2. Public Submission API (`/api/cube-request-submit.js`)
Because Firestore security rules require authentication for direct writes, public submissions are routed through a Vercel serverless function:
- **Verification:** The API receives the payload and the `recaptchaToken`. It performs a server-to-server POST request to `https://www.google.com/recaptcha/api/siteverify` using the `CUBESYNC_RECAPTCHA_SECRET_KEY`.
- **IP Tracking:** The user's IP address (extracted from `x-forwarded-for`) is passed to Google for better risk analysis.
- **Admin SDK:** Only after successful reCAPTCHA verification does the API initialize the Firebase Admin SDK to write the document to the `cubeRequests` collection.

### 3. Environment Configuration
The system requires specific environment variables for reCAPTCHA to function:

| Variable | Scope | Purpose |
|----------|-------|---------|
| `CUBESYNC_RECAPTCHA_SITE_KEY` | Browser | Used by the widget to identify your site to Google. |
| `CUBESYNC_RECAPTCHA_SECRET_KEY` | Server | Used by the API to verify tokens. **Never expose this.** |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Server | Firebase Admin service account JSON used by the API to write Firestore. |
| `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` | Server | Optional alternative to `FIREBASE_SERVICE_ACCOUNT_JSON` for hosts where multiline JSON is brittle. |

#### Local Development
For local development, you have two options:
1.  **Build Script:** Create a `.env` file with `CUBESYNC_RECAPTCHA_SITE_KEY` and run `npm run build`. This generates `env.js`.
2.  **Manual:** Copy `env.example.js` to `env.js` and edit the site key directly.

#### Troubleshooting
- **"reCAPTCHA site key is not configured":** Ensure `env.js` exists and contains a valid key.
- **"reCAPTCHA is still loading":** Usually caused by slow network or the `grecaptcha` script failing to load from Google's CDN. Refresh the page.
- **"reCAPTCHA verification failed":** The server rejected the token. This happens if the secret key is wrong, the token expired, or Google detected suspicious activity.
- **"Expected property name or '}' in JSON at position 1":** `FIREBASE_SERVICE_ACCOUNT_JSON` is not valid JSON. Property names must use double quotes, for example `{"type":"service_account"}`, not `{type:"service_account"}` or `{'type':'service_account'}`. If Vercel multiline paste is unreliable, set `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` to the base64-encoded full service-account JSON file instead.
- **`frame-ancestors 'self'` warning for `https://www.google.com/`:** reCAPTCHA v2 renders Google iframes. If the browser says the violation is `report-only`, it is logged but not blocked. Treat it as informational unless the widget fails to render.

## Data schema

All forms are stored in the `cubeRequests` Firestore collection. Canonical field names live in `cubesync-form-data.js` (`FORM_FIELDS`, `RESULT_FIELDS`, `REQUIRED_FORM_FIELDS`).

### Request fields (`FORM_FIELDS`)

| Field | Label (UI) | Required by default |
|-------|------------|---------------------|
| `projectErp` | Project (ERP) | No |
| `customerBilling` | Customer (Billing) | Yes |
| `projectNameOnReport` | Project Name on Report | No |
| `clientNameOnReport` | Client Name on Report | No |
| `contact` | Contact | Yes |
| `enableManualCubeJobNumber` | Enable Manual Cube Job # | No (checkbox) |
| `cubeJobNumber` | Cube Job # | No (enabled by checkbox) |
| `quote` | Quote | No |
| `testItem` | Test Item | No |
| `concreteGrade` | Grade | Yes |
| `reportGrade` | Grade (free text) | Yes |
| `supplier` | Supplier Of Concrete | Yes |
| `supplierDisplay` | Supplier Of Concrete Display | Yes |
| `locationRepresented` | Location | Yes |
| `additionalInformation` | Additional Info | No |
| `dateOfCast` | Date of cast | Yes |
| `slumpMeasured` | Mean Slump | Yes |
| `specimenSize` | Size | Yes |
| `slumpSpecified` | Specified Slump | Yes |
| `personInCharge` | Person In Charge | Yes |
| `managerInCharge` | Manager In Charge | Yes |

Legacy aliases (`reportNo`, `client`, `project`, `internalDate`, etc.) are normalized on read/write via `applyLegacyRequestAliases()` for dashboard and export compatibility.

### Result fields (`RESULT_FIELDS`, one row per set)

`setNo`, `size`, `specimenRef`, `barcode`, `specifiedSlump`, `meanSlump`, `resultGrade`, `resultDateOfCast`, `age`, `dateOfTest`, `invoiceNumber`

Test-result table headers and cells use `data-result-field="{name}"` for column show/hide when field settings disable a column.

### System fields

`template`, `status`, `results`, `createdAt`, `updatedAt`, `rpaStatus`, `erpStatus`, `attemptCount`, `customFields`

Barcodes are stored as **text only** — SVGs are rendered client-side via Code 128-B encoding. Never store generated barcode images in Firestore.

### Settings collection

| Document | Path | Purpose |
|----------|------|---------|
| Form field config | `settings/formFieldConfig` | Which request fields and result columns are enabled on both forms (`requestFields`, `resultFields`, `updatedAt`) |

Staff manage this from **Field settings** on `dashboard.html`. Forms cache the config in `localStorage` under `cubesync-form-field-config`.

## Form validation

Validation is **custom JavaScript**, not native HTML5 constraint validation:

- Both forms use `novalidate` on `#cubeRequestForm` so hidden step-1 fields (e.g. empty `dateOfCast` on step 2) do not trigger browser “not focusable” errors.
- `validateCubeRequestForm()` / `validateCubeRequestPayload()` in `cubesync-form-data.js` enforce `REQUIRED_FORM_FIELDS`, excluding fields disabled in dashboard field settings.
- `syncNativeFormConstraints()` removes the `required` attribute from fields on inactive form steps when the user is on step 2.
- On submit failure, `app.js` shows a message in `#saveStatus`, navigates back to the step containing the first missing field, and focuses it.

Required fields must be filled before save; test-result rows are validated separately (at least one row with meaningful data when submitting).

## Autocomplete suggestion dropdowns

Several request fields show a typeahead dropdown as the user types (`setupAutocomplete()` in `app.js`):

| Input `name` | Options file | `localStorage` key |
|--------------|--------------|-------------------|
| `projectErp` | `dropdown-options/project erp.txt` | `savedProjectErps` |
| `customerBilling` | `dropdown-options/customer billing.txt` | `savedCustomerBillings` |
| `supplier` | `dropdown-options/supplier.txt` | `savedSuppliers` |
| `concreteGrade` | `dropdown-options/Grade.txt` | `savedGrades` |
| `personInCharge` | `dropdown-options/person-in-charge.txt` | `savedPersonsInCharge` |
| `managerInCharge` | `dropdown-options/manager-in-charge.txt` | `savedManagersInCharge` |
| `testItem` | `dropdown-options/testitem.txt` | `savedTestItems` |
| `specimenSize` | `dropdown-options/size.txt` | `savedSizes` |

Options are merged from the static file (via `fetch`) and prior user entries in `localStorage`. **`reportGrade` is free text only** — no autocomplete.

These files live under `dropdown-options/`. They are the selector options for the dropdown menu/autocomplete inputs on the request form. For production (Vercel), `npm run build` copies the whole `dropdown-options/` folder into `public/`. If dropdowns are empty in production, confirm those files exist under the deployed site root (e.g. `/dropdown-options/supplier.txt`).

## Custom free text fields

Fields with dropdown menus (`specimenSize`, `managerInCharge`, `testItem`, etc.) support free-text entries dynamically wired through `app.js`. If a user types into one of these fields instead of selecting a dropdown option, the field name is recorded in the `customFields` array.

The `dashboard.html` human dashboard reads the `customFields` array, shows a free-text counter on the form list, shows a legend in the detail panel, and applies orange `<span class="highlight-custom">` styling to visually call out affected values.

## Barcodes

Enter text in any barcode field and a Code 128-B barcode is generated automatically. The encoder validates printable ASCII (chars 32–126), computes a weighted checksum, and renders an accessible `<svg>` with `role="img"` and `aria-label`.

## Build and static assets

`npm run build` runs `scripts/write-env.js`, which:

1. Writes `env.js` (and `public/env.js`) with `RECAPTCHA_SITE_KEY` from environment variables.
2. Copies static app files into `public/` for Vercel (`index.html`, `glassmorphic.html`, JS, CSS, `assets/`, etc.).
3. Copies **autocomplete option files** — the full `dropdown-options/` folder.

Vercel uses `outputDirectory: "public"` (`vercel.json`). Do not deploy without running the build step, or autocomplete files will be missing from production.

```sh
# Install dev dependencies (testing + linting only)
npm install

# Generate env.js from .env / deployment variables
npm run build

# Validate local secret formatting without printing secrets
npm run validate-env

# Run the test suite (Node.js built-in test runner)
npm test

# Lint with ESLint
npm run lint
```

### Local API Testing

Live Server can serve the static pages, but it cannot run Vercel serverless functions. The forms post to `/api/cube-request-submit`, so end-to-end form submission must be tested with Vercel:

```sh
vercel dev
```

If you open the app with Live Server and click Save, a `405 Method Not Allowed` from `/api/cube-request-submit` means the static server is handling the API path instead of the Vercel function. This is expected for Live Server; use `vercel dev` locally or deploy to Vercel for full submission testing.

### Test suite

The project uses `node:test` + `node:assert/strict` with `jsdom` for DOM simulation. Tests are organized in three tiers:

| Tier | Pattern | Example |
|------|---------|---------|
| Unit tests | Pure function → assert output | `barcode.test.js`, `export.test.js`, `form-field-config.test.js` |
| Functional tests | JSDOM + mocked Firebase → simulate clicks → assert DOM | `app-functional.test.js`, `dashboard-functional.test.js` |
| Contract tests | Read source as string → regex assertions on structure | `form.test.js`, `firestore.test.js`, `deployment-config.test.js` |

Notable regression coverage:

- `form-field-config.test.js` — field enable/disable, validation with config, `syncNativeFormConstraints`
- `app-functional.test.js` — multi-step submit, autocomplete wiring, hidden-step validation (`dateOfCast` / `novalidate`)
- `deployment-config.test.js` — build output includes autocomplete option files in `public/dropdown-options/`

## Firestore rules safety

`firestore.rules` also contains WorkGrid rules from another sensitive app. **Do not edit the WorkGrid rule blocks** for CubeSync work.

CubeSync-specific access must stay in the clearly marked `CUBESYNC-ONLY RULES` block for `cubeRequests` and `settings/formFieldConfig`. Direct client Firestore access remains authenticated-only. Public customer forms submit through `/api/cube-request-submit`, which verifies reCAPTCHA v2 and writes with Firebase Admin.

The allowlist is maintained in `firestore.js` as `CUBESYNC_ALLOWED_EMAILS`. It mirrors the WorkGrid-listed emails plus CubeSync additions such as `ernestngcy@gmail.com`; do not add CubeSync-only users by editing WorkGrid rule code.

## Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview and quick start (this file) |
| `overview.md` | High-level architecture summary |
| `design.md` | Design system: palette, tokens, typography, components |
| `architecture.md` | UML diagrams: class, sequence, component, state, and data model |
| `free-text-dropdown-highlighting.md` | TDD progress and behavior for typed dropdown option highlighting |
| `RPA_SELECTOR_REFERENCE.md` | Stable CSS selectors and field names for RPA automation |

## Deployment

Hosted on Vercel as a static site (`public/` output) plus `/api/cube-request-submit`.

1. Set `CUBESYNC_RECAPTCHA_SITE_KEY`, `CUBESYNC_RECAPTCHA_SECRET_KEY`, and `FIREBASE_SERVICE_ACCOUNT_JSON` (or `_BASE64`) in Vercel.
2. Ensure the build command is `npm run build` and output directory is `public` (`vercel.json`).
3. Deploy Firestore rules when changing `settings/formFieldConfig` access (`firestore.rules`).
4. Push to `main` to deploy.

After deploy, verify autocomplete files are reachable (e.g. `https://your-site/dropdown-options/supplier.txt`) and form field settings save from the dashboard.
