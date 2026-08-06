# CubeSync — Test Coverage Audit

**Date:** 2026-08-07 · **Tests:** 591 pass, 0 fail · **Runtime:** approximately 11 seconds

---

## Executive Summary

CubeSync has a broad, fast test suite with 558 application tests and 33 Firestore rules emulator tests. The native Node coverage report is excellent at 98.51% lines, 91.50% branches, and 91.75% functions, but those aggregate values are optimistic because test files are included while eight production browser scripts are omitted from instrumentation.

The most important improvement is therefore not simply adding more assertions. Large scripts such as `dashboard.js`, `metrics-page.js`, and `firestore.js` must be loaded through an instrumentable module boundary so their real line and branch coverage can be measured. Existing JSDOM functional tests exercise much of this code, but coverage cannot currently show which paths they miss.

| Metric | Value | Rating |
|---|---:|---|
| Total tests | 591 passing | ✅ Healthy |
| Line coverage | 98.51% | 🟢 Excellent measured result |
| Branch coverage | 91.50% | 🟢 Excellent measured result |
| Function coverage | 91.75% | 🟢 Excellent measured result |
| Instrumented production JavaScript files | 19 of 27 | 🔴 Incomplete visibility |

> Coverage caveat: Node's aggregate includes highly covered `*.test.js` files. It does not include browser files evaluated through `script.textContent`, `window.eval()`, or direct `eval()`, so the aggregate is not a reliable source-only percentage.

## Test and Coverage Configuration

- `npm test` runs the application suite followed by Firestore rules emulator tests.
- `scripts/run-app-tests.js` discovers root-level `*.test.js` files and runs Node's native `--experimental-test-coverage` reporter.
- `scripts/run-firestore-rules-tests.js` starts the Firestore emulator and runs `firestore-rules-emulator.test.js`.
- No minimum line, branch, or function thresholds are enforced by the runner.
- CSS and HTML are checked through DOM and source-text assertions, not browser-rendered visual regression tests.

## Coverage by Source File

### Well-Covered and Instrumented

These production files meet the audit target of at least 90% line coverage and 80% branch coverage:

| Source file | Lines | Branches | Functions |
|---|---:|---:|---:|
| `api/cube-request-submit.js` | 96.50% | 96.20% | 100.00% |
| `api/dropdown-options.js` | 94.51% | 86.05% | 100.00% |
| `barcode.js` | 98.58% | 93.10% | 100.00% |
| `cubesync-autocomplete.js` | 98.27% | 80.00% | 100.00% |
| `cubesync-connectivity.js` | 100.00% | 83.33% | 100.00% |
| `cubesync-dashboard-filters.js` | 97.37% | 85.92% | 100.00% |
| `cubesync-export.js` | 98.96% | 92.62% | 100.00% |
| `cubesync-form-data.js` | 95.50% | 87.34% | 98.69% |
| `cubesync-form-markup.js` | 98.18% | 85.00% | 100.00% |
| `cubesync-heatmap.js` | 98.99% | 94.59% | 100.00% |
| `cubesync-metrics.js` | 98.54% | 80.81% | 100.00% |
| `cubesync-notifications.js` | 97.84% | 85.71% | 100.00% |
| `scripts/load-env.js` | 100.00% | 94.59% | 100.00% |
| `scripts/validate-env.js` | 91.95% | 90.91% | 100.00% |
| `scripts/write-env.js` | 100.00% | 87.50% | 100.00% |

### Instrumented Files Needing Attention

| Source file | Lines | Branches | Functions | Main gap |
|---|---:|---:|---:|---|
| `api/_utils/firebase-api-helper.js` | 89.07% | 79.41% | 100.00% | Nested observability redaction and Firebase initialization failure branches |
| `app.js` | 96.84% | 74.11% | 98.21% | reCAPTCHA fallbacks, form population guards, cached/remote config failures, and print lifecycle edges |
| `cubesync-schema.js` | 94.74% | 62.50% | 100.00% | CommonJS/browser wrapper and missing-key schema branches |
| `cubesync-table-manager.js` | 98.21% | 75.86% | 100.00% | Missing controls, invalid dates, absent markup, and callback guard paths |

### Not Instrumented

These files are read as strings and evaluated in JSDOM or a custom scope. Their functional tests may pass, but native V8 coverage omits the production file itself.

| Source file | Size | Approximate complexity | Existing test mechanism |
|---|---:|---:|---|
| `dashboard.js` | 83,437 bytes | 220 function-like lines | JSDOM `script.textContent` |
| `metrics-page.js` | 29,629 bytes | 79 function-like lines | JSDOM `script.textContent` |
| `firestore.js` | 13,724 bytes | 51 function-like lines | Rewritten source executed with `window.eval()` |
| `rpa-dashboard.js` | 15,383 bytes | 56 function-like lines | JSDOM `script.textContent` |
| `rpa-view.js` | 7,353 bytes | 24 function-like lines | JSDOM `script.textContent` and source assertions |
| `cubesync-today-toggle.js` | 13,579 bytes | 33 function-like lines | JSDOM `script.textContent` |
| `sw.js` | 6,282 bytes | 21 function-like lines | Direct `eval()` with mocked service-worker globals |
| `chime.js` | 3,593 bytes | 11 function-like lines | `window.eval()` |

Generated `env.js`/`env.example.js` and the two test-runner scripts are intentionally excluded from the production coverage inventory.

## Top Coverage Gaps and Remediation Actions

### 🔴 P0 — High Priority

1. **`dashboard.js` is a massive uninstrumented state and mutation surface**
   - **Why it is a risk:** The 83 KB file contains authentication gates, edit/save/delete actions, status transitions, history writes, field configuration, realtime rendering, and error handling. More than 30 functional tests exercise it, but none contribute coverage to `dashboard.js`, so missed production branches are invisible.
   - **Remediation:** Extract pure state, authorization-decision, payload, and action-controller functions into directly imported modules. Keep a smaller DOM bootstrap file and retain JSDOM tests as integration coverage.

2. **`firestore.js` database and authentication operations are not instrumented**
   - **Why it is a risk:** The file owns sign-in, realtime subscriptions, create/update/delete operations, edit-history writes, settings writes, and shared dropdown persistence. Current tests rewrite and evaluate its source, so the native report cannot identify untested failure or rollback paths.
   - **Remediation:** Move Firebase SDK calls behind an injectable adapter and export the operational functions from an instrumentable module. Add direct tests for rejected writes, snapshot errors, create-versus-update behavior, and failed settings/history persistence.

3. **Observability redaction branches are below target in `firebase-api-helper.js`**
   - **Why it is a risk:** Lines 61–70 recursively redact tokens, passwords, secrets, private keys, and nested values before server logging. An uncovered branch could expose sensitive data in logs.
   - **Remediation:** Capture `console.log`/`console.error` around `logServerEvent()` and assert redaction for nested objects, arrays, case variants, punctuation variants, nulls, and safe values. Export `sanitizeForLog()` for direct unit tests if necessary.

4. **`metrics-page.js` exceeds 20 KB but is absent from coverage**
   - **Why it is a risk:** Chart rendering, summary computation, async history loading, error states, and UI initialization are tested only through injected source. The recent midnight-sensitive failure demonstrates how presentation tests can hide time-boundary assumptions.
   - **Remediation:** Split chart renderers, summary formatters, time-window construction, and page orchestration into imported modules. Pass an explicit clock into date-sensitive code and fixtures.

### 🟡 P1 — Medium Priority

1. **No rendered print-layout regression test**
   - Current `form.test.js` assertions verify CSS text for the three-column grid, full-width results table, compact barcode, and Botpress selectors. They cannot prove Chrome's computed print layout or detect overflow, stacking, or widget shadow/host changes.
   - Add a browser test that emulates `print` media on A4 landscape and asserts: three request-grid tracks, results-table width no greater than its container, every enabled result header visible, barcode bounds inside its cell, and `.bpChatContainer` hidden. Add one stable screenshot or PDF snapshot after geometry assertions.

2. **`app.js` branch coverage is 74.11%**
   - Add direct cases for missing reCAPTCHA container/widget APIs, `requestSubmit` fallback, corrupt cached field configuration, unavailable remote configuration, invalid barcode rendering, offline submission, and print cancellation/cleanup.

3. **RPA browser scripts are uninstrumented**
   - `rpa-dashboard.js` and `rpa-view.js` contain auth checks and status writes. Convert their decision and mutation logic into imported modules; directly test unauthorized access, Firestore rejection, missing records, and status rollback after failed updates.

4. **`cubesync-today-toggle.js` is an uninstrumented UI state engine**
   - Extract date selection and toggle-state calculations into a directly required module. Cover midnight, daylight/timezone boundaries, invalid stored dates, rapid toggles, and absent DOM controls.

5. **`cubesync-table-manager.js` branch coverage is 75.86%**
   - Add cases for invalid/reversed dates, missing form sources, non-empty targets that must not be overwritten, missing `CubeSyncFormMarkup`, and the `onRowAdded` callback path.

6. **Service-worker behavior is evaluated but not measured**
   - Add an instrumentable service-worker core module for cache policy and request classification. Cover install failure, partial cache failure, navigation fallback, non-GET requests, cache update failures, and version migration.

### 🟢 P2 — Low Priority / Polish

1. **`cubesync-schema.js` branch coverage is 62.50%**
   - Cover missing `formData`, browser-global initialization, and omission of unavailable facade keys. The low percentage is concentrated in a small wrapper rather than core validation logic.

2. **`chime.js` is omitted from coverage**
   - Its JSDOM tests are useful, but direct module loading would make the small audio/error fallback surface measurable.

3. **Coverage thresholds are not enforced**
   - After uninstrumented scripts are modularized, fail CI when source-only coverage falls below an agreed baseline. A reasonable starting point is 90% lines, 80% branches, and 90% functions, with stricter thresholds for API security and database adapters.

## Structural and Architectural Observations

- The suite has strong breadth: public API validation, authentication failures, create-only submission behavior, Firestore permissions, payload normalization, UI state, RPA flows, offline behavior, and field configuration all have tests.
- The 33 emulator tests are especially valuable because they execute the actual Firestore rules rather than matching rule text. They cover non-staff denial, profile ownership, role escalation, immutable fields, report-number sequencing, append-only history, and collection-specific access.
- `scripts/run-app-tests.js` reports test files in the same aggregate as production code. This inflates the headline percentage and should be replaced or post-processed into a source-only summary.
- JSDOM string injection is useful for end-to-end browser-script behavior, but it should supplement directly instrumented modules, not be the only execution path for major files.
- Time-sensitive tests should use an injected or fixed clock. The corrected daily-completions fixture now uses fixed times on the current local date instead of subtracting hours across midnight.
- CSS source assertions are fast regression guards, but layout-sensitive features such as printing need computed-style and geometry verification in a real browser.

## Recommended Execution Order

1. Add the real-browser print regression test while the expected layout is fresh.
2. Refactor and instrument `firestore.js` and the mutation/auth portions of `dashboard.js`.
3. Extract and instrument `metrics-page.js`, using an explicit clock for date windows.
4. Cover observability redaction and the remaining `app.js` branches.
5. Modularize RPA, today-toggle, and service-worker logic.
6. Introduce source-only coverage thresholds after the major blind spots are visible.
