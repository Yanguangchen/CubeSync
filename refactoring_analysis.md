# CubeSync — Refactoring Analysis Report

**Date:** 2026-07-03 · **Scope:** application JavaScript, APIs, tests, Firestore rules, build configuration, dependencies, and maintainer documentation

---

## Executive Summary

CubeSync is functional and extensively tested, but it is not yet well-refactored as a whole. Shared form, schema, metrics, export, autocomplete, and API helpers show good modularization; the main dashboard remains a 2,449-line global controller with 104 functions and mixed UI, state, authentication, persistence, notification, analytics, and editing responsibilities. This monolith also causes the largest coverage blind spot because browser entrypoints are evaluated as strings in JSDOM instead of imported as modules.

Overall assessment:

| Area | Rating | Basis |
|---|---|---|
| Refactoring | Needs work | `dashboard.js`, `cubesync-form-data.js`, and dashboard CSS are oversized; browser-global module boundaries impede direct testing |
| Testing | Strong breadth, weak measurement integrity | 527 tests discovered; rules suite passes 7/7; default `npm test` is red and aggregate coverage includes tests while omitting eval-loaded production files |
| Hardening | Moderate | Good validation/auth/rules controls, but no application rate limit and 38 audited dependency vulnerabilities |
| Documentation | Broad but inconsistent | Strong architecture, developer, feature, security, and postmortem docs; several historical claims are stale |

## Major Refactoring Targets

### 🔴 P0 — Critical Targets

1. **Split `dashboard.js` into importable feature modules**
   - **Current state:** 2,449 lines and 104 named functions. It combines auth gating, realtime subscriptions, list/detail rendering, metrics, heatmaps, notifications, field configuration, dropdown management, edit history, editing, deletion, printing, theme state, and DOM binding.
   - **Why it is a problem:** Changes have a large regression surface, dependencies are implicit globals, and JSDOM string injection prevents trustworthy per-file coverage.
   - **Proposed refactoring:** Extract `dashboard/state`, `dashboard/rendering`, `dashboard/editor`, `dashboard/settings`, `dashboard/history`, and `dashboard/auth` modules. Keep a small bootstrap that wires explicit dependencies and DOM elements.

2. **Make security-critical browser data access directly testable**
   - **Current state:** `firestore.js`, `rpa-dashboard.js`, `rpa-view.js`, `cubesync-today-toggle.js`, `sw.js`, and `chime.js` are loaded/evaluated as source text in tests and omitted from file-level coverage.
   - **Why it is a problem:** Existing tests prove selected scenarios but cannot show unexecuted lines and branches in authorization, write, status-transition, and offline paths.
   - **Proposed refactoring:** Move pure adapters and transitions into UMD/CommonJS-compatible cores that Node can import; leave browser bootstrap code thin.

3. **Restore a green, deterministic default test command**
   - **Current state:** `npm test` discovers the emulator-only rules file without starting Firestore, producing 520 passes and seven setup failures. `npm run test:firestore-rules` passes 7/7.
   - **Why it is a problem:** A permanently red default command masks regressions and weakens CI trust.
   - **Proposed refactoring:** Exclude the emulator suite from the default glob and run it as a separate required CI task.

### 🟡 P1 — Medium Priority Targets

1. **Reduce `cubesync-form-data.js` scope.** At 1,984 lines and 86 functions, it combines schema, validation, normalization, DOM configuration, history diffing, observability, and error classification. Split DOM/config rendering from pure domain functions and observability.
2. **Consolidate duplicated presentation helpers.** `escapeHtml` exists in `barcode.js`, `dashboard.js`, `rpa-dashboard.js`, and `rpa-view.js`; error formatting and barcode rendering are also repeated. Provide shared browser-safe helpers with direct unit tests.
3. **Split dashboard CSS.** `css/dashboard.css` is 2,161 lines despite some feature CSS already being separated. Continue extracting editor, detail/history, filters, metrics, and responsive sections.
4. **Add production-only coverage gates.** Exclude tests from the denominator, include every production file (including unexecuted files), and set explicit line/branch/function thresholds.
5. **Resolve dependency exposure deliberately.** `npm audit --omit=dev` reports 38 vulnerabilities (18 high), largely through the Vercel CLI dependency tree plus Firebase Admin transitive packages. Move build-only CLI tooling to `devDependencies`, upgrade safely, and re-audit rather than applying the suggested breaking downgrade.
6. **Add platform/application abuse controls.** reCAPTCHA protects public submission, but there is no explicit application-level request rate limit or payload-size guard. Configure platform rate limiting and enforce a bounded request body.

### 🟢 P2 — Low Priority / Technical Debt

1. Centralize status/template constants that currently cross UI, API, Firestore rules, RPA, and documentation boundaries.
2. Standardize browser module conventions; the repository currently mixes CommonJS APIs, UMD modules, global IIFEs, and source-string evaluation.
3. Reduce expected error/warning noise in tests so unexpected diagnostics are easy to detect.
4. Add an automated documentation link/freshness check for test counts, commands, and security status.

## Hardening Assessment

Controls already present:

- Public submissions are create-only and server-forced to `Draft`, blocking IDOR updates and direct RPA queue injection.
- reCAPTCHA success and hostname are checked server-side.
- Dropdown writes require a verified Firebase ID token and an authoritative staff allowlist.
- Firestore rules require verified allowlisted staff and validate create/update shapes.
- Behavioral emulator tests cover allow/deny rules, invalid statuses, disallowed keys, and public settings reads.
- API logging recursively redacts key/token/secret-like fields.
- Dynamic dashboard/RPA output generally passes through HTML escaping.

Remaining material risks:

- No explicit application-level rate limiting or request-body size limit is visible in the API/configuration.
- The dependency tree has unresolved high-severity advisories.
- CORS falls back to reflecting any origin when `CUBESYNC_ALLOWED_ORIGINS` is absent; production correctness depends on environment configuration.
- Firestore rules are a large shared multi-application file, increasing blast radius and review complexity.
- The default test command does not provide a green security regression gate.

## Documentation Assessment

Documentation is unusually comprehensive for the project size: it covers architecture, data/schema, developer workflows, design, RPA selectors, security findings, feature-specific behavior, and incident postmortems. The main weakness is freshness and duplication.

Known inconsistencies include:

- `documentation/firestore-rules-expression-limit-postmortem.md` still says emulator tests do not exist and reports an older 520/520 suite state.
- `documentation/README.md` still describes the security audit as having outstanding CORS, emulator-test, rules-validation, and allowlist work even though those items are marked complete elsewhere.
- Test counts and coverage facts are repeated across several documents, making drift likely.

Use `test_coverage_audit.md` as the canonical current coverage report and `documentation/security-audit.md` as the canonical security status. Other documents should link to those sources instead of copying volatile figures.

## Proposed Refactored Architecture

```text
browser bootstrap
├── dashboard/index.js
├── dashboard/auth.js
├── dashboard/state.js
├── dashboard/list-view.js
├── dashboard/detail-view.js
├── dashboard/editor.js
├── dashboard/settings.js
└── dashboard/history.js

domain modules
├── schema/
├── validation/
├── form-data/
├── status-transitions/
└── shared/presentation.js

adapters
├── firestore-adapter.js
├── notifications-adapter.js
└── api-client.js
```

The bootstrap layer should only resolve DOM nodes and assemble dependencies. Domain modules should be directly importable without `window`, `document`, Firebase, or JSDOM.
