# CubeSync Refactoring & Architectural Debt TODO

This document tracks identified architectural gaps and refactoring items discovered during the comprehensive codebase audit.

---

## 🔴 P0 — Critical Remediation Items

### 1. Extract Centralized API Helper (`api/_utils/firebase-api-helper.js`)
- **Status:** Done
- **Problem:** `api/cube-request-submit.js` and `api/dropdown-options.js` duplicate over 70 lines of identical CORS formatting, JSON response helpers, quote stripping, service account decoding, and Firebase Admin initialization.
- **Action Items:**
  - [x] Create `api/_utils/firebase-api-helper.js` exporting `json()`, `setApiHeaders()`, `stripWrappingQuotes()`, `serviceAccountJson()`, `parseServiceAccount()`, and `initializeFirebaseAdmin()`.
  - [x] Refactor `api/cube-request-submit.js` to import and use the helper.
  - [x] Refactor `api/dropdown-options.js` to import and use the helper.
  - [x] Verify unit and functional tests pass for both endpoints.

### 2. Centralize Staff Allowlist (`shared/staff-allowlist.json` or module)
- **Status:** Done
- **Problem:** `CUBESYNC_ALLOWED_EMAILS` is hardcoded across `api/dropdown-options.js`, `firestore.js`, and `firestore.rules`.
- **Action Items:**
  - [x] Create `shared/staff-allowlist.json` containing the authoritative list of 25 staff emails.
  - [x] Update `api/dropdown-options.js` to load the allowlist from `shared/staff-allowlist.json`.
  - [x] Update `firestore.js` to import/load the allowlist from `shared/staff-allowlist.json` (synchronized via strict unit test assertion).
  - [x] Add a note or check ensuring `firestore.rules` remains synchronized.

### 3. Decouple Backend API from Browser DOM Logic
- **Status:** Done
- **Problem:** Backend handlers require `cubesync-form-data.js` which includes browser-specific DOM manipulation (`syncNativeFormConstraints`, `applyRequestFieldState`, `querySelector`).
- **Action Items:**
  - [x] Extract pure schema definitions, validation logic, and constants into a Node-safe module (`cubesync-schema.js` facade).
  - [x] Ensure serverless endpoints only load Node-safe validation logic without DOM dependencies.

---

## 🟡 P1 — Medium Priority Maintenance

### 4. Modularize Monolithic UI Controllers
- **Status:** Pending
- **Problem:** `dashboard.js` (2,208 lines) and `cubesync-form-data.js` (1,773 lines) have high cyclomatic complexity and combine disparate concerns.
- **Action Items:**
  - [ ] Identify cohesive sub-modules in `dashboard.js` (e.g., filtering, chart rendering, table management).
  - [ ] Extract sub-modules while preserving existing browser global definitions for backward compatibility.

### 5. Standardize Date & Timezone Formatting
- **Status:** Pending
- **Problem:** Singapore timezone helpers (`Asia/Singapore`) are scattered across `rpa-dashboard.js`, `rpa-view.js`, and `dashboard.js`.
- **Action Items:**
  - [ ] Create a shared date utility helper for consistent SGT formatting.
