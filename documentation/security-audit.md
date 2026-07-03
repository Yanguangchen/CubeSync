# CubeSync — Security & Test-Coverage Audit

_Updated: 2026-07-03_

Audit of the CubeSync code paths (public submission API, client auth/CRUD,
Firestore rules) and the test suite. The WorkGrid rules in `firestore.rules`
are out of scope per the maintenance note — only the CubeSync block and shared
helpers were assessed.

## Test coverage snapshot

`npm test` (Node's built-in test runner with `--experimental-test-coverage`)
discovers 533 tests across the application and Firestore rules phases. The
default command starts or reuses the emulator automatically. The dedicated
`npm run test:firestore-rules` command passes all twelve rules tests. Current
aggregate coverage is 97.84% lines, 91.48% branches, and 91.42% functions.
These figures include test files and omit eval-loaded browser entrypoints, so
they are not a valid production-only 100% baseline.

**Instrumentation blind spot:** the main browser entrypoints below are exercised
through jsdom functional tests, but they still do not appear as first-class
source files in Node's coverage table because the tests inject/evaluate them as
browser scripts rather than `require`ing them as modules:

| File | Status |
| --- | --- |
| `dashboard.js` | Exercised by dashboard unit/functional/realtime tests, not instrumented as a source file |
| `rpa-dashboard.js` | Exercised by RPA unit/functional/coverage-audit tests, not instrumented as a source file |
| `rpa-view.js` | Exercised by RPA view tests, not instrumented as a source file |
| `firestore.js` | Real file read + eval'd in `firestore-runtime.test.js`; not counted as source coverage |

**Largest structural gap:** `dashboard.js` (2,403 lines) is exercised by several
functional suites but omitted from file-level coverage because it is injected
into JSDOM as source text. `app.js` is measured at 96.76% lines / 73.39%
branches / 98.11% functions.

## Findings & remediation status

### 🔴 HIGH — Public API accepted arbitrary `status` (RPA/ERP injection) — ✅ FIXED
`cleanPayload` accepted `status ∈ {Draft, Ready, Archived}`. The endpoint is
unauthenticated (reCAPTCHA-gated only), so anyone who solves one reCAPTCHA —
manually, or via a solving service at ~$1–3 per 1,000 — could POST
`status: "Ready"` and land a request straight in the RPA bot queue, which feeds
the ERP automation.
**Fix:** `api/cube-request-submit.js` now ignores client `status` and forces
`Draft`. Promotion to `Ready` requires the authenticated dashboard.
Tests: `api-handler.test.js` ("forces public submissions to Draft status"),
`api-handler-unit.test.js` ("cleanPayload forces any supplied status to Draft").

### 🔴 HIGH — Public API allowed overwriting any document by `id` (IDOR) — ✅ FIXED
The handler did `doc(id).set(clean, { merge: true })` for any caller-supplied
`id`. A raw POST (not the form) with any `id` + a valid reCAPTCHA token could
patch/tamper with any existing `cubeRequests` document.
**Fix:** the endpoint is now **create-only** — any supplied `id` returns `400`,
and it always `add()`s a new document. The public form (`app.js`) no longer
sends an `id`.
Tests: `api-handler.test.js` ("rejects submissions targeting an existing
document id"), `api-handler-unit.test.js` (malformed and well-formed id both
rejected).

### 🟠 MEDIUM — CORS reflects arbitrary `Origin` — ✅ FIXED
`setApiHeaders` in `api/_utils/firebase-api-helper.js` now reads `CUBESYNC_ALLOWED_ORIGINS` (comma-separated). If configured, only matching origins are reflected; non-matching origins fall back to the primary allowed origin or block cross-origin requests.
Tests: `api-handler-unit.test.js` ("CORS enforces CUBESYNC_ALLOWED_ORIGINS allowlist when configured").

### 🟠 MEDIUM — Firestore rules validation is incomplete — ✅ FIXED
- `isValidCubeResults` in `firestore.rules` unrolls validation across all 50 possible result rows (`value[0]` through `value[49]`).
- `isValidExtraFields` now deep-validates up to 25 map entries via `isValidExtraFieldsList`, ensuring keys match `^[a-z][a-zA-Z0-9_]{0,31}$` and values are boolean, number, or string ($\le$ 500 chars).
Tests: `firestore.test.js` regex assertions verify the presence of deep validation rules for `extraFields` and index checks up to 49.

### 🟡 LOW — Staff allowlist duplicated and already drifted — ✅ FIXED
Authoritative staff list consolidated in `shared/staff-allowlist.json` (25 emails). Unit tests in `firestore.test.js` automatically assert that `firestore.js` and `firestore.rules` (`isCubeSyncAllowedEmail`) match this authoritative list exactingly. Note: WorkGrid bootstrap masters (`isHardcodedMaster`) are separate and out of scope.

### 🟡 LOW — reCAPTCHA hostname/action not verified — ✅ FIXED
`verifyRecaptcha` in `api/cube-request-submit.js` checks `result.hostname` against `CUBESYNC_ALLOWED_HOSTNAMES` (falling back to `CUBESYNC_ALLOWED_ORIGINS`). Replay attacks from unauthorized hostnames are rejected with `400`. Development fallback exceptions (`localhost`, `127.0.0.1`, `testkey.google.com`) are preserved for test environments.
Tests: `api-handler-unit.test.js` ("reCAPTCHA fails when hostname does not match configured CUBESYNC_ALLOWED_HOSTNAMES").

## Largest outstanding test gap

**Coverage instrumentation remains incomplete.** Behavioral Firestore rules tests now verify staff and non-staff access, invalid status rejection, dashboard updates, disallowed keys, and public settings access. The largest remaining issue is that browser entrypoints executed through JSDOM/eval are not attributed to their source files. Work toward a production-only 100% target is deferred; it requires importable browser modules and coverage configuration that excludes test files while including unexecuted production files.

## Recommended next steps (priority order)

1. ~~Public-endpoint hardening (create-only + forced Draft)~~ — **done.**
2. ~~CORS origin allowlist (`CUBESYNC_ALLOWED_ORIGINS`)~~ — **done.**
3. ~~Tighten rules validation (all 50 result rows + `extraFields` deep validation)~~ — **done.**
4. ~~De-duplicate staff allowlist + add sync test~~ — **done.**
5. ~~reCAPTCHA hostname verification against allowlist~~ — **done.**
6. ~~Firestore rules emulator tests (behavioral testing with `@firebase/rules-unit-testing`)~~ — **done.**
7. Production-only coverage instrumentation and a 100% target — **deferred.**
