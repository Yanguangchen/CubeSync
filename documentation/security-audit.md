# CubeSync — Security & Test-Coverage Audit

_Date: 2026-06-21_

Audit of the CubeSync code paths (public submission API, client auth/CRUD,
Firestore rules) and the test suite. The WorkGrid rules in `firestore.rules`
are out of scope per the maintenance note — only the CubeSync block and shared
helpers were assessed.

## Test coverage snapshot

`npm test` → 223 tests pass; ~96% line / ~90% branch on instrumented files.

**Blind spot:** the two largest behavioral files are not in the coverage report
because they're only eval'd inside jsdom, never `require`d:

| File | Lines | Status |
| --- | --- | --- |
| `dashboard.js` | 1,144 | Exercised via functional tests, not instrumented |
| `rpa-dashboard.js` | 404 | Exercised via functional tests, not instrumented |
| `firestore.js` | 277 | Real file read + eval'd in `firestore-runtime.test.js`; not counted |

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

### 🟠 MEDIUM — CORS reflects arbitrary `Origin` — ⏳ OUTSTANDING
`setApiHeaders` sets `Access-Control-Allow-Origin = request.headers.origin || "*"`,
so any site can call the API from a browser. No credentials are used, limiting
impact, but it should be an allowlist.
**Proposed:** read `CUBESYNC_ALLOWED_ORIGINS` (comma-separated; default the prod
Vercel domain) and only reflect listed origins. Deferred to keep the HIGH fix
dependency-free (this one needs an env var).

### 🟠 MEDIUM — Firestore rules validation is incomplete — ⏳ OUTSTANDING
- `isValidCubeResults` validates only result rows 0–9 but allows `size ≤ 50`;
  rows 10–49 (and their per-row `hasOnly` key restriction) are unchecked.
- `isValidExtraFields` only checks `is map && size ≤ 25` — values are not
  type/length-validated. The API's `cleanExtraFields` validates them, but the
  **authenticated staff client path** (direct Firestore writes) is governed only
  by rules. A staff/compromised account could write unvalidated bulk content.
**Proposed:** validate all result rows (or cap at a validated count) and
deep-validate `extraFields` values in the rules.

### 🟡 LOW — Staff allowlist duplicated and already drifted — ⏳ OUTSTANDING
The allowlist is hand-copied in 3 places. `firestore.js` and
`isCubeSyncAllowedEmail` (rules) list 22 emails incl. `ernestngcy@…` /
`jlee.j.m9382@…`; `isHardcodedMaster` (rules) lists 20 without them.
**Proposed:** single source of truth + a test asserting `firestore.js` and the
rules allowlist stay in sync (goals.md: "Keep `firestore.js` and
`firestore.rules` staff allowlists in sync").

### 🟡 LOW — reCAPTCHA hostname/action not verified — ⏳ OUTSTANDING
`verifyRecaptcha` only checks `result.success`. Acceptable for v2; adding
hostname verification would block token replay from other properties sharing the
site key.

## Largest outstanding test gap

**No behavioral tests for `firestore.rules`.** `firestore.test.js` verifies the
rules by `readFileSync` + regex `assert.match` — it checks the *text*, never
evaluates authorization. ~1,200 lines of access control (allowlist enforcement,
`isValidCubeRequestUpdate`, status/enum checks, immutable fields) have zero
behavioral verification; the validation gaps above pass every existing test.
**Proposed:** add `@firebase/rules-unit-testing` emulator tests asserting
`assertFails`/`assertSucceeds` for the CubeSync collection — non-staff denied,
staff allowed, oversized/invalid payloads denied, immutable fields locked.

## Recommended next steps (priority order)

1. ~~Public-endpoint hardening (create-only + forced Draft)~~ — **done.**
2. CORS origin allowlist (MEDIUM, needs `CUBESYNC_ALLOWED_ORIGINS`).
3. Firestore rules emulator tests (largest coverage hole).
4. Tighten rules validation (all result rows + `extraFields` values).
5. De-duplicate the staff allowlist + add a sync test.
