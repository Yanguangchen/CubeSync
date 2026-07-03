# CubeSync — Test Coverage Audit

**Date:** 2026-07-03 · **Default run:** 520 pass, 7 fail · **Runtime:** 7.67s

---

## Executive Summary

The reported aggregate is strong, but it is not a trustworthy production-coverage baseline: Node includes test files in the denominator, while several of the largest browser modules are executed through JSDOM `eval` and omitted entirely. The seven default-run failures are also a runner-configuration problem rather than failing rules assertions: `npm test` discovers the emulator-only suite without starting the Firestore emulator; all seven rules tests pass through the dedicated emulator command.

| Metric | Value | Rating |
|---|---:|---|
| Tests in `npm test` | 527 (520 pass, 7 setup failures) | 🔴 Default command is not green |
| Line coverage | 97.84% | 🟡 Inflated by test files and omissions |
| Branch coverage | 91.48% | 🟡 Inflated by test files and omissions |
| Function coverage | 91.42% | 🟡 Inflated by test files and omissions |
| Firestore rules suite | 7/7 pass against emulator | ✅ |

## Coverage by Source File

### Well-covered and instrumented

| File | Lines | Branches | Functions |
|---|---:|---:|---:|
| `api/cube-request-submit.js` | 96.50% | 96.20% | 100% |
| `api/dropdown-options.js` | 94.51% | 86.05% | 100% |
| `barcode.js` | 98.58% | 93.10% | 100% |
| `cubesync-autocomplete.js` | 98.27% | 80.00% | 100% |
| `cubesync-connectivity.js` | 100% | 83.33% | 100% |
| `cubesync-dashboard-filters.js` | 97.37% | 85.92% | 100% |
| `cubesync-export.js` | 98.95% | 92.62% | 100% |
| `cubesync-form-data.js` | 95.11% | 87.24% | 98.67% |
| `cubesync-form-markup.js` | 98.04% | 85.00% | 100% |
| `cubesync-heatmap.js` | 98.99% | 94.59% | 100% |
| `cubesync-notifications.js` | 97.84% | 85.71% | 100% |

### Needs attention

| File | Lines | Branches | Functions | Main gap |
|---|---:|---:|---:|---|
| `api/_utils/firebase-api-helper.js` | 89.07% | 79.41% | 100% | CORS allowlist and Firebase initialization/error paths |
| `app.js` | 96.76% | 73.39% | 98.11% | Many UI, validation, and failure decisions remain untested |
| `cubesync-metrics.js` | 97.52% | 75.63% | 100% | Date coercion and workload-classification branches |
| `cubesync-schema.js` | 94.74% | 62.50% | 100% | Missing-dependency and export-selection branches |
| `cubesync-table-manager.js` | 98.21% | 73.08% | 100% | Optional controls, invalid dates, and row-add callbacks |

### Not instrumented / coverage blind spots

These production files do not appear in the V8 report even though tests load several of them as strings and execute them through JSDOM or `eval`:

| File | Size | Evidence / consequence |
|---|---:|---|
| `dashboard.js` | 2,403 lines | Loaded into many JSDOM suites; no file-level coverage |
| `rpa-dashboard.js` | 481 lines | String-loaded by RPA suites; no file-level coverage |
| `firestore.js` | 460 lines | Executed with `window.eval` in runtime tests; no file-level coverage |
| `cubesync-today-toggle.js` | 366 lines | Injected into dashboard functional tests; no file-level coverage |
| `rpa-view.js` | 230 lines | String-loaded by RPA suites; no file-level coverage |
| `sw.js` | 219 lines | Executed with direct `eval`; no file-level coverage |
| `chime.js` | 123 lines | Executed with `dom.window.eval`; report measures test wrappers, not this file |

HTML, CSS, `firestore.rules`, and static configuration are also outside V8's JavaScript coverage model. Their behavioral/static tests must be tracked separately.

## Top Coverage Gaps & Remediation Actions

### 🔴 P0 — High Priority

1. **`dashboard.js` has no measurable coverage (2,403 lines).**
   - **Risk:** This module owns authentication gates, Firestore reads/writes, editing, filtering, and real-time behavior. Functional tests exist, but regressions cannot be mapped to unexecuted lines or branches.
   - **Remediation:** Split pure/stateful logic into CommonJS or ESM modules importable by Node. Keep a thin browser bootstrap and collect coverage from direct imports. Prioritize auth denial, write failure, listener teardown, malformed records, and conflicting edit paths.

2. **Firestore rules tests are incorrectly included in `npm test`.**
   - **Risk:** The default test command reports seven failures whenever no emulator is available, obscuring genuine failures and making CI status environment-dependent.
   - **Remediation:** Narrow the default glob to exclude `firestore-rules-emulator.test.js`, then run `npm run test:firestore-rules` as a separate CI job. The emulator suite itself passed 7/7 in this audit.

3. **`firestore.js` and RPA write paths are not instrumented.**
   - **Risk:** Authorization, update payloads, status transitions, and error handling are security/state boundaries. Existing eval-driven tests prove examples but provide no completeness signal.
   - **Remediation:** Extract Firestore adapters and RPA transition logic into directly imported modules; add negative tests for unauthorized users, rejected writes, malformed snapshots, unsubscribe behavior, and each status-transition failure.

### 🟡 P1 — Medium Priority

1. **`app.js` branch coverage is 73.39%.** Add table-driven tests for uncovered validation, initialization, API/network, and optional-DOM branches (not just happy-path line execution).
2. **`api/_utils/firebase-api-helper.js` is below both thresholds.** Add exact-origin CORS tests (allowed, denied, empty/malformed allowlist), logging redaction for nested arrays/objects, missing Firebase Admin, and initialization failures.
3. **Metrics/schema/table-manager branches are below 80%.** Cover invalid cross-realm dates, timestamp adapter failures, zero-denominator trends, absent schema dependencies, invalid row dates, missing markup globals, and callbacks.
4. **No enforceable production-only thresholds exist.** Configure `c8`/Istanbul or Node coverage include/exclude rules so `*.test.js` is excluded and every production JS file is included, including unexecuted files at 0%.

### 🟢 P2 — Low Priority / Polish

1. Remove duplicate coverage of UMD boilerplate once browser modules have importable cores.
2. Track static HTML/CSS/config checks separately from executable-code coverage.
3. Reduce expected warning/error logging in test output so unexpected diagnostics are visible.

## Structural & Architectural Observations

- `node --test --experimental-test-coverage` reports every loaded JavaScript file, including test code. The 97.84% line figure should not be used as a quality gate.
- JSDOM `runScripts: "dangerously"` plus `eval` is the dominant blind spot. It provides useful integration confidence, but the evaluated source is not attributed to its original filename.
- The test portfolio is substantial (527 discovered tests), and the dedicated Firestore emulator assertions cover key allow/deny behavior. The immediate need is measurement integrity, not simply adding more tests.
- Recommended gates after instrumentation is fixed: 90% production lines, 80% production branches, 90% functions, 100% execution of security-critical API/rules suites, and no production source file omitted from the report.

## Commands and Reproduction

```sh
npm test
npm run test:firestore-rules
# When an emulator is already running:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test firestore-rules-emulator.test.js
```

The dedicated emulator command started Firestore, produced 7 passes and 0 failures in 2.48 seconds, and shut the emulator down cleanly.
