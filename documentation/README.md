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
| `documentation/` | Project docs (`README.md`, `design.md`, `architecture.md`, `project-uml.md`, `overview.md`, `RPA_SELECTOR_REFERENCE.md`) |
| `scripts/` | Build and env helpers (`write-env.js`, `load-env.js`) |
| `api/` | Vercel serverless handlers |
| `assets/` | Logos, icons, XP theme images |
| `public/` | Generated deploy output (`npm run build`) — do not edit by hand |

The repo root keeps a short [README.md](../README.md) that links here.

### Global APIs

| Global | Source | Purpose |
|--------|--------|---------|
| `window.CubeSyncBarcode` | `barcode.js` | `encodeCode128B`, `renderBarcodeSvg`, `sanitizeBarcodeText` |
| `window.CubeSyncFormData` | `cubesync-form-data.js` | Schema, validation, serialization, field config, free-text helpers (`collectCustomFields`, `deriveFreeTextDropdownFields`, `mergeFreeTextDropdownFields`), patch updates (`buildCubeRequestUpdatePatch`), `normalizeCubeRequestForDashboard` |
| `window.CubeSyncDashboardFilters` | `cubesync-dashboard-filters.js` | Dashboard list sort/filter — `parseDateKey`, `currentIsoDate`, `collectFilterOptions`, `applyDashboardFilters` (see [dashboard-sort-and-filter.md](dashboard-sort-and-filter.md)) |
| `window.CubeSyncHeatmap` | `cubesync-heatmap.js` | Dashboard submission heatmap helpers — `buildHeatmap`, `resolveTimestamp`, `bucketLabels` |
| `window.CubeSyncMetrics` | `cubesync-metrics.js` | Operational metrics dashboard helpers — daily/weekly/monthly counts, average forms per day, peak periods, processed records, manual-review records, cube job number collisions (`cubeJobCollisions`, incl. today), activity leaderboard (`buildActivityLeaderboard`), daily Ready completions (`buildDailyCompletions`) |
| `window.CubeSyncTodayToggle` | `cubesync-today-toggle.js` | Glass "Today only" tactile switch — `setup(container)` binds it to the source-of-truth checkbox (see [dashboard-sort-and-filter.md](dashboard-sort-and-filter.md)) |
| `window.CubeSyncExport` | `cubesync-export.js` | `buildExportFiles`, `buildFormCsv`, `createZipBlob`, `downloadFilesAsZip` |
| `window.CubeSyncFirestore` | `firestore.js` | `savePublicCubeRequest`, `listCubeRequests`, `getCubeRequest`, `saveCubeRequest`, `updateCubeRequest`, `deleteCubeRequest`, `addEditHistoryEntry`, `listEditHistory`, `listAllEditHistory` (collection-group query for the metrics leaderboard/completions — requires the `/{path=**}/editHistory` read rule to be deployed), `getFormFieldConfig`, `saveFormFieldConfig`, `getDropdownOptions`, `addDropdownOptions`, `saveDropdownOptions` (see [dynamic-dropdown-options.md](dynamic-dropdown-options.md)) |
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
- **Create-only:** The endpoint is unauthenticated (reCAPTCHA only proves "a human," not "an authorized user"), so it **rejects any caller-supplied `id`** and always `add()`s a new document. It never `set(..., { merge: true })`s an existing one. This closes an IDOR where anyone with a reCAPTCHA token could overwrite arbitrary records. Staff edits go through the authenticated dashboard (rules-protected), not this endpoint.
- **Forced Draft status:** Any client-supplied `status` is ignored and overwritten to `Draft`. Only authenticated staff can promote a request to `Ready`/`Archived` via the dashboard, so an anonymous submission can never inject itself directly into the RPA/ERP queue (which processes only `Ready` forms). See [security-audit.md](security-audit.md).

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

| Field | Purpose |
|-------|---------|
| `template` | `Original` or `Glassmorphic` |
| `status` | `Draft`, `Ready`, or `Archived` (human dashboard lifecycle) |
| `results` | Array of test-result rows (`RESULT_FIELDS`) |
| `customFields` | Dropdown field names typed as free text at submit time (see [Free-text dropdown review](#free-text-dropdown-review)) |
| `extraFields` | Map of staff-defined custom field id → value (`{ [customFieldId]: value }`) |
| `createdAt`, `updatedAt` | Server timestamps |
| `rpaStatus`, `erpStatus`, `attemptCount` | RPA queue / ERP automation metadata |

Legacy aliases (`reportNo`, `client`, `project`, `internalDate`, etc.) may still exist on older documents; the dashboard and export normalize them on read.

Barcodes are stored as **text only** — SVGs are rendered client-side via Code 128-B encoding. Never store generated barcode images in Firestore.

### Settings collection

| Document | Path | Purpose |
|----------|------|---------|
| Form field config | `settings/formFieldConfig` | Org-wide form UI configuration (single document, not per request) |
| Dropdown options | `settings/dropdownOptions` | Shared autocomplete suggestions (merged with static files) |

| Config key | Type | Purpose |
|------------|------|---------|
| `requestFields` | map | Canonical request field name → enabled boolean |
| `resultFields` | map | Result column name → enabled boolean |
| `requestLabels` | map (optional) | Custom label overrides for public form request fields |
| `resultLabels` | map (optional) | Custom label overrides for public form result columns |
| `customRequestFields` | array (optional) | Staff-defined custom field definitions (`id`, `label`, `type`, `required`, `enabled`, `formLabel`) |
| `updatedAt` | timestamp | Last save from dashboard field settings |

Dropdown option arrays (`projectErp`, `customerBilling`, `supplier`, etc.) are stored in the `dropdownOptions` document.

Staff manage this from **Field settings** on `dashboard.html`. Forms cache the config in `localStorage` under `cubesync-form-field-config`.

**Label override boundary:** `requestLabels` and `resultLabels` are customer-facing presentation only. They apply only to the public request forms (`index.html`, `glassmorphic.html`) so customer labels can be clearer than internal field names. The dashboard, RPA queue, RPA view, exports, selectors, Firestore document keys, and bot logic must continue to use canonical/internal field names. Do not build RPA logic against renamed visible labels.

## Form validation

Validation is **custom JavaScript**, not native HTML5 constraint validation:

- Both forms use `novalidate` on `#cubeRequestForm` so hidden step-1 fields (e.g. empty `dateOfCast` on step 2) do not trigger browser “not focusable” errors.
- `validateCubeRequestForm()` / `validateCubeRequestPayload()` in `cubesync-form-data.js` enforce `REQUIRED_FORM_FIELDS`, excluding fields disabled in dashboard field settings.
- If a DOM input has the `data-config-disabled="true"` attribute (applied synchronously when the form loads its config cache), it is excluded from validation. This prevents a race condition where a user submits the form before the async Firestore field config fully updates the `activeFieldConfig` state.
- **Server-side validation parity:** The `/api/cube-request-submit` serverless endpoint also fetches `formFieldConfig` directly from Firestore before saving. This ensures that if staff disable a required field (like Customer Billing), the server correctly accepts the submission without throwing a 400 Bad Request error.
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

Options are merged from three sources in order: the static deployed file, shared Firestore options (`settings/dropdownOptions`), and prior user entries in `localStorage`. **`reportGrade` is free text only** — no autocomplete.

These files live under `dropdown-options/`. They are the selector options for the dropdown menu/autocomplete inputs on the request form. For production (Vercel), `npm run build` copies the whole `dropdown-options/` folder into `public/`. If dropdowns are empty in production, confirm those files exist under the deployed site root (e.g. `/dropdown-options/supplier.txt`).

## Free-text dropdown review

Eight request fields use autocomplete dropdowns (`DROPDOWN_OPTION_FIELDS` in `cubesync-form-data.js`): `projectErp`, `customerBilling`, `supplier`, `concreteGrade`, `personInCharge`, `managerInCharge`, `testItem`, `specimenSize`.

### Capture on the public form (`app.js`)

When a user **types** into a dropdown-backed field instead of selecting a suggestion, `app.js` sets `dataset.freeTextEntry = "true"` on that input. On save, `collectCustomFields()` writes the canonical field names to `customFields` on the Firestore document.

Selecting an option from the suggestion list clears the free-text flag for that field.

### Display on the human dashboard (`dashboard.js`)

The dashboard flags fields **by value**, via `resolveFreeTextDropdownFields()`:

1. **Value-based (preferred)** — if an option list is loaded for the field, flag it only when the stored value is **not** in that list (case-insensitive). A value matching a valid option is never flagged, so valid selections (and valid typed values) are not tagged.
2. **Metadata fallback** — if no option list is available for a field, fall back to the capture-time `customFields` entry.

Option lists load once after sign-in via `loadDropdownOptionSets()`, which fetches the deployed `dropdown-options/*.txt` files **only** (not `localStorage`) so the judgment is consistent across machines.

Visual indicators (see `css/dashboard.css`):

| UI element | Class / behavior |
|------------|------------------|
| Form list row tint | `.has-custom-fields` on `<tr>` |
| Row badge | `.custom-field-count` — e.g. “2 free-text fields” |
| Detail legend | `.custom-field-legend` |
| Highlighted value | `.highlight-custom` inside `.detail-field.is-custom-field` |

**Promotion:** When a flagged form is set to `Ready` (RPA-ready), any flagged free-text values are automatically promoted to the shared Firestore option lists (`settings/dropdownOptions`) so they become suggestions for everyone and stop being flagged on the dashboard. Staff can also manually edit the shared lists via **Field settings** → **Manage options**.

See [free-text-dropdown-highlighting.md](free-text-dropdown-highlighting.md) for TDD history and implementation notes.

## Custom request fields (staff-defined)

Separate from free-text dropdown review, staff can define **additional request fields** from dashboard **Field settings** → **Custom request fields**:

- Definitions live in `settings/formFieldConfig.customRequestFields[]`.
- Per-request values are stored in `cubeRequests.extraFields` as `{ [id]: value }`.
- Types: `text`, `number`, `date`, `checkbox`, `textarea`.
- Public forms render enabled custom fields via `applyCustomRequestFields()`; the submit API whitelists and sanitizes `extraFields`.

## Dashboard saves

Staff edits from `dashboard.html` use a **patch update** path:

1. `buildCubeRequestFromForm()` + `dashboardEditToCubeRequest()` build the full in-memory payload.
2. `buildCubeRequestUpdatePatch(existing, payload)` compares against the loaded Firestore document (`form.raw`) and sends **only changed fields** to `updateCubeRequest()`.
3. `firestore.js` adds `updatedAt: serverTimestamp()` and strips `undefined` via `withoutUndefined()`.

`withoutUndefined()` recurses only into plain objects and arrays. Firestore sentinels (`serverTimestamp()` / `FieldValue`), `Timestamp`, and `Date` instances must pass through unchanged — flattening them causes rules validation to reject the write with `permission-denied`.

RPA status updates use the same `updateCubeRequest()` helper but typically send a single field (`rpaStatus` or `erpStatus`).

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

### Offline PWA Support (Service Worker)

CubeSync registers a service worker (`sw.js`) on the app pages. The strategy is:
- **Pre-cache** the entire static app shell (HTML, CSS, JS, images, dropdown option files) on install.
- **Stale-while-revalidate** for all same-origin static assets so the app updates in the background.
- **Bypass cache entirely** for live endpoints (Firebase database, Google APIs, Vercel API, `env.js`).

This ensures the forms load instantly and tolerate brief network drops, while keeping dynamic data and auth requests strictly live.

> [!WARNING]
> **Cache Purging Required:** Because of this caching strategy, browsers aggressively hold onto the static app shell. **Every time you make new changes** to HTML, CSS, or JS files, you must either bump the `CACHE_NAME` variable in `sw.js` or manually purge your local service worker cache via Browser DevTools (Application > Service Workers > Unregister / Clear Storage) to see your updates. If you do not purge the cache or bump the version, you will continue seeing the old version of the app.

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

- **`free-text-dropdown.test.js`** — dedicated regression suite for free-text review (metadata vs value resolve, localStorage exclusion, dashboard wiring)
- `form-field-config.test.js` — field enable/disable, custom labels, custom request field CRUD, validation with config
- `form-data.test.js` — `resolveFreeTextDropdownFields`, patch updates (`buildCubeRequestUpdatePatch`)
- `app-functional.test.js` — multi-step submit, typed-vs-selected autocomplete, `customFields` on save, hidden-step validation
- `dashboard-functional.test.js` — free-text badge/legend/highlight rendering, patch save behavior
- `firestore-runtime.test.js` — `serverTimestamp()` sentinel preserved through `updateCubeRequest`
- `deployment-config.test.js` — build output includes autocomplete option files in `public/dropdown-options/`

The suite currently discovers **533 tests**. `npm test` first runs the 521-test application suite with coverage, then starts or reuses the Firestore emulator for twelve behavioral rules tests. Use `npm run test:app` or `npm run test:firestore-rules` when either phase needs to run independently. Both phases are green.

The latest native coverage report shows 97.84% lines, 91.48% branches, and 91.42% functions. These aggregate values are not production-only: test files are included, while browser entrypoints loaded through JSDOM `eval` are omitted. The remaining percentage must not be treated as a simple count of missing tests. See the [test coverage audit](../test_coverage_audit.md) for the source-level gaps and deferred path to a trustworthy 100% target.

## Firestore rules safety

`firestore.rules` also contains WorkGrid rules from another sensitive app. **Do not edit the WorkGrid rule blocks** for CubeSync-only work.

CubeSync-specific access must stay in the clearly marked `CUBESYNC-ONLY RULES` block for `cubeRequests` and `settings/formFieldConfig`. Direct client Firestore access requires **verified Google Auth email** on the CubeSync allowlist (`isCubeSyncStaff()`). Public customer forms submit through `/api/cube-request-submit`, which verifies reCAPTCHA v2 and writes with Firebase Admin (bypasses rules).

The allowlist is maintained in `firestore.js` as `CUBESYNC_ALLOWED_EMAILS` and mirrored in `firestore.rules` (`isCubeSyncAllowedEmail()`). Keep both lists in sync when adding staff.

Some CubeSync staff intentionally overlap with WorkGrid hard-coded master/admin accounts because both apps are operated by the same organization. That overlap is approved by design. For a future CubeSync-only user, add them only to `CUBESYNC_ALLOWED_EMAILS` and `isCubeSyncAllowedEmail()` unless they also need WorkGrid admin authority.

Updates to `cubeRequests` are validated by `isValidCubeRequestUpdate()` — only whitelisted keys may change, and changed fields must pass type/length checks. A rules rejection surfaces in the client as `permission-denied: Missing or insufficient permissions`.

Known WorkGrid permission-policy watch items:

- Inactive WorkGrid users can still update their own profile name/phone because the self-update rule uses `isSignedIn()` while locking role/status/team/email. Tighten this to `isActiveUser()` if inactive users should have no writes.
- Booking and collision operations are intentionally shared across active operational users. Because of that design, audit-like fields such as `updatedBy`, `cancelledBy`, and collision `loggedBy` are client-controlled on updates; move those writes server-side or bind them to `request.auth.uid` if they become audit evidence.

## Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview and quick start (this file) |
| `overview.md` | High-level architecture summary |
| `developer-guide.md` | Comprehensive maintainer handbook: repository map, runtime flows, data model, testing, security, and deployment checklists |
| `design.md` | Design system: palette, tokens, typography, components, responsive patterns |
| `architecture.md` | UML diagrams: class, sequence, component, state, and data model |
| `project-uml.md` | Comprehensive project-wide UML diagrams for current modules, data, flows, and security boundaries |
| `free-text-dropdown-highlighting.md` | Free-text review flags, capture vs review semantics, regression tests |
| `dashboard-sort-and-filter.md` | Dashboard list sort and filter logic |
| `dashboard-ux-animations.md` | Dashboard UX animations and master-detail reveal logic |
| `form-submission-throbber.md` | Form submission save button spinner behavior |
| `print-layout.md` | CSS logic for enforcing single A4 landscape sheet form printing |
| `test-item-lock.md` | Explanation of test item lockdown to BS EN 12390-3: 2019 standard |
| `RPA_SELECTOR_REFERENCE.md` | Stable CSS selectors and field names for RPA automation |
| `mobile-responsiveness-postmortem.md` | Postmortem: mobile responsiveness issues, root causes, and fixes — read when adding CSS grids or flex layouts |
| `firestore-rules-expression-limit-postmortem.md` | Postmortem: multi-field dashboard saves rejected as "permission denied" by Firestore's 1,000-expression rules cap — **read before editing any validator in `firestore.rules`** |
| `security-audit.md` | Security & test-coverage audit: public-API hardening (done) and outstanding gaps (CORS, rules emulator tests, rules validation, allowlist sync) |

## Deployment

Hosted on Vercel as a static site (`public/` output) plus `/api/cube-request-submit`.

1. Set `CUBESYNC_RECAPTCHA_SITE_KEY`, `CUBESYNC_RECAPTCHA_SECRET_KEY`, and `FIREBASE_SERVICE_ACCOUNT_JSON` (or `_BASE64`) in Vercel.
2. Ensure the build command is `npm run build` and output directory is `public` (`vercel.json`).
3. Deploy Firestore rules when changing CubeSync access or payload validation (`firestore.rules`):

   ```sh
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules --project crewhub-43647
   ```

   Project ID must match `firebaseConfig.projectId` in `firestore.js`. Copy-pasting rules in the Firebase console works, but CLI deploy avoids partial paste mistakes.

4. Push to `main` (or run `vercel --prod`) to deploy the static app and API.

After deploy, verify:

- Autocomplete files are reachable (e.g. `https://cube-sync.vercel.app/dropdown-options/supplier.txt`).
- Field settings save from the dashboard.
- Status changes and edits save without `permission-denied` (requires current `firestore.js` + rules).
- Free-text flags appear on the dashboard when a dropdown value is not in the option list.
