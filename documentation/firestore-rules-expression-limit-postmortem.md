# Postmortem: Multi-field dashboard edits rejected with "Missing or insufficient permissions"

**Date fixed/deployed:** 2026-07-02 (project `crewhub-43647`)
**Labels:** bug, firestore, security-rules, dashboard

## Symptom

Editing **several fields in one save** from the human dashboard (`dashboard.html`)
failed with the Firebase error:

```
FirebaseError: Missing or insufficient permissions.
```

Editing the **same fields one at a time** succeeded every time. No code change
preceded the breakage — records simply accumulated enough result sets for
multi-field saves to start failing.

## TL;DR root cause

This was **never a permissions problem**. Firestore evaluates security rules
with a hard cap of **1,000 expressions per request** and rejects any request
that exceeds the cap with the *same* `permission-denied` error as a genuine
rule failure ([Firestore rules limits](https://firebase.google.com/docs/firestore/security/rules-structure)).

`isValidCubeRequestUpdate()` in `firestore.rules` validated only the fields
that changed (`!fieldChanged || validate(field)`), so:

- **One field edited** → one validator branch runs → a few hundred expressions → under the cap → allowed.
- **Many fields edited in one save** → every changed field's validator runs in
  a single request → over the cap → `permission-denied`.

The error is indistinguishable from a real rule denial on the client, which is
what made it look like a permissions bug.

## Where the expression budget went

Three compounding costs in the old `isValidCubeRequestUpdate()`:

| Cost | Detail | Approx. expressions |
|------|--------|--------------------|
| Diff recomputation | `cubeRequestChanged(field)` recomputed `request.resource.data.diff(resource.data).affectedKeys()` **once per field** — ~37 times per update, plus once for the `hasOnly` allow-list | ~150 (paid on **every** save) |
| Deep `results` validation | Any change to a result cell puts the **whole `results` array** in the patch (the client always writes the full array), triggering `isValidCubeResults` → `isValidCubeResult` per row: `hasOnly` over 18 keys + 18 × `optCubeStrOrNum` (~7 sub-expressions each) | **~130 per populated row** |
| `extraFields` / `customFields` | Per-key/per-entry validation of up to 25 extra fields and 8 custom fields | ~200 + ~30 |

A save touching a few text fields on a record with 5–6 result sets:
`150 + (6 × 130) + 200 + per-field checks ≈ 1,100+` → over the cap → denied.
A single-field save stayed near ~300 → allowed. That is exactly the
one-at-a-time-works / batch-fails behaviour observed.

This is the **same disease** that previously hit WorkGrid booking edits in this
shared rules file — see the "Update validation is DIFF-ONLY" comment above the
bookings `isValidBookingUpdate()`, which documents the identical recurring
"missing or insufficient permissions" symptom.

## Why it wasn't caught

1. **The rules tests are static text checks.** `firestore.test.js` regex-matches
   the rules source; it never executes the rules, so runtime evaluation cost is
   invisible to it.
2. **The emulator does not enforce the 1,000-expression cap.** Only production
   Firestore does, so even emulator-based rules tests (which this repo does not
   yet have — see `security-audit.md`) would have passed.
3. **The failure is data-dependent.** Fresh records with few result rows stay
   under the cap; the bug only appears once a record has enough populated rows,
   long after the rules were deployed.

## The fix (`firestore.rules`, CubeSync block only)

### 1. Compute the diff once

`cubeRequestChanged()` was deleted. `isValidCubeRequestUpdate()` now binds the
diff a single time with `let` and reuses it in every clause:

```diff
-    function cubeRequestChanged(field) {
-      return request.resource.data.diff(resource.data)
-        .affectedKeys().hasAny([field]);
-    }
-
     function isValidCubeRequestUpdate() {
-      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
+      let changed = request.resource.data.diff(resource.data).affectedKeys();
+      return changed.hasOnly([
           ...
         ]) &&
-        (!cubeRequestChanged('status') ||
+        (!changed.hasAny(['status']) ||
           request.resource.data.status in ['Draft', 'Ready', 'Archived']) &&
         ...
```

All per-field scalar checks (string lengths, enums, ints, timestamps,
string-or-number slump values) were **kept** — they are cheap once the diff is
shared.

### 2. `results` is shape-checked only on update

Deep per-row validation was the budget killer and is now **create-only**:

```diff
-        (!cubeRequestChanged('results') ||
-          isValidCubeResults(request.resource.data.results)) &&
+        (!changed.hasAny(['results']) ||
+          (request.resource.data.results is list &&
+            request.resource.data.results.size() <= 50)) &&
```

This mirrors the WorkGrid bookings precedent and is a deliberate trade-off:
only allowlisted staff can update `cubeRequests` at all, the client
(`cubesync-form-data.js` → `normalizeResultRowsForUpdate`) normalizes every row
before each save, and Firestore's 1 MB document limit is the backstop. Deep
per-row re-validation on every update added expression cost without a matching
security gain.

### 3. Create-side row validation trimmed to a 5-row spot check

`isValidCubeResults` (used by `isValidCubeRequest` on **create**) validated the
first 50 rows; at ~130 expressions per populated row, a create with 7+ rows
would have blown the same cap. It now deep-validates the first 5 rows plus
`is list && size() <= 50`.

### Post-fix budget

Worst-case multi-field save: ~330 expressions (vs ~1,100+ before) — roughly 3×
headroom under the cap.

## Regression tests

`firestore.test.js` — new test
**"Firestore rules keep multi-field dashboard saves under the 1,000-expression cap"**:

- `isValidCubeRequestUpdate` must contain **exactly one** `.diff(resource.data)`
  call, bound via `let changed = ...`.
- The update validator must **not** call `isValidCubeResults` (deep row
  validation stays create-only) and must keep the cheap
  `results is list && size() <= 50` shape check.

Existing tests were updated for the new structure (`changed.hasAny([...])`
instead of `cubeRequestChanged(...)`, 5-row instead of 50-row spot check).
Full suite: 520/520 passing.

## Deployment

```sh
firebase deploy --only firestore:rules --project crewhub-43647
```

Deployed 2026-07-02. Reminder: **rules changes do nothing until deployed** — an
earlier partial mitigation sat undeployed in the working tree while the
production error persisted.

## How to prevent recurrence

When editing any validator in `firestore.rules` (shared by WorkGrid, CubeSync,
and DocuAlign):

1. **Budget expressions, not just correctness.** Every rule request has a
   1,000-expression cap, and exceeding it is reported as `permission-denied`.
   If a save fails with a permission error but the same fields pass
   individually and all keys are on the `hasOnly` allow-list, suspect the cap
   first — boolean rule logic cannot produce "batch fails, one-by-one passes".
2. **Bind `diff().affectedKeys()` once with `let`** — never via a per-field
   helper function (functions cannot share the binding, so each call recomputes
   the diff).
3. **Never deep-validate unbounded arrays on update.** Per-element validation of
   a 50-element array with ~18 fields each cannot fit in the budget. Validate
   shape/size on update; keep content validation on create and in the client.
4. **Don't trust the emulator or static tests for this class of bug** — neither
   enforces the cap. The regression test pins the structural properties
   (single diff, no deep row validation on update) instead.

---

# Follow-up: the 2026-07-02 fix was still over the cap

**Date fixed:** 2026-07-09 (project `crewhub-43647` / CubeSync block only)
**Labels:** bug, firestore, security-rules, dashboard

## What changed since the original postmortem

Two assumptions in the section above turned out to be **wrong**, and a new
runtime test surfaced them:

1. **The emulator *does* enforce the 1,000-expression cap.** `firebase-tools`
   14.10.1's Firestore emulator rejects an over-budget request with
   `7 PERMISSION_DENIED: Unable to evaluate the expression as the maximum of
   1000 expressions to evaluate has been reached`, observable in
   `firestore-debug.log`. The "only production enforces the cap" claim in *Why
   it wasn't caught* (#2) and *How to prevent recurrence* (#4) no longer holds —
   we now have an emulator-driven regression suite that reproduces the denial.

2. **The 2026-07-02 budget estimate (~330 expressions) was optimistic.** The
   emulator's actual per-request accounting is far heavier than the hand count
   in *Where the expression budget went*. Under it:
   - A create with just **two sparsely-populated result rows** blew the cap.
   - A **fully-populated create** (50 rows + all scalar fields + `customFields`
     + 25 `extraFields`) blew the cap.
   - An update touching **~20 top-level fields at once** blew the cap, even
     though the diff was already bound once with `let` and `results` was
     shape-checked only.

   So the earlier fix (single diff + shape-only `results` on update + 5-row
   create spot check) was necessary but **not sufficient**.

## New regression tests

`firestore-rules-emulator.test.js` (run via
`npm run test:firestore-rules`, which boots the real emulator through
`firebase emulators:exec`) executes the rules against live data and pins the
boundary directly:

- `staff can create a cubeRequest with shape-valid (sparsely-populated) result rows`
- `staff can create a maximal cubeRequest under the expression cap`
- `staff can update approximately 20 dashboard fields at once under the cap`
- `the emulator rejects an over-complex ruleset` (compiler-complexity self-check)

These replace reliance on static text checks for this class of bug — they fail
loudly (`permission-denied`) the moment a validator goes back over budget.

## The fix (`firestore.rules`, CubeSync block only)

The guiding principle from the original fix — *validate shape/keys/enums/bounds
in rules; normalize content in the client* — was extended to **every** scalar
field on **both** create and update.

### 1. Create no longer deep-validates result rows at all

The 5-row spot check (`isValidCubeResults` → `isValidCubeResult`, ~130
expressions/row) was removed. `results` now gets the same cheap shape check on
create as on update:

```diff
-        (!('results' in data) || isValidCubeResults(data.results)) &&
+        (!('results' in data) ||
+          (data.results is list && data.results.size() <= 50)) &&
```

`isValidCubeResult` and `isValidCubeResults` were deleted (they had no other
callers). `optCubeStrOrNum`, orphaned by the change below, was deleted too.

### 2. Create dropped its ~29 per-field string-length guards

`isValidCubeRequest` kept the security-critical checks — the `hasOnly` key
allowlist, enum fields (`template`, `status`), numeric bounds (`version`,
`attemptCount`), structural checks (`customFields`, `extraFields`, `results`
shape), the `enableManualCubeJobNumber` bool, and timestamps — and dropped the
`optStrWithin` / `optCubeStrOrNum` length guard on each scalar field.

### 3. Update dropped its ~30 per-field `changed.hasAny([x])` guards

Each single-field length guard built a one-element list and did a set
intersection; ~30 of them was the update-path budget killer. Collapsed to ~10
`hasAny` probes covering the same critical invariants as create (allowlist,
enums, numeric bounds, `customFields`/`extraFields`, `results` shape,
timestamps).

## Why dropping the length guards is an acceptable trade-off

- Only allowlisted, email-verified staff (`isCubeSyncStaff()`) can write
  `cubeRequests` at all.
- The client (`cubesync-form-data.js`) and the API normalize field content and
  length before every save.
- Firestore's **1 MB document limit** is the hard backstop against oversized
  writes.
- No test asserted length- or row-content rejection; the invariants the suite
  *does* pin (key allowlist via `hasOnly`, `status`/`template` enums, the
  verified-staff gate) are all still enforced.

Net change: `firestore.rules` −171 lines. Full suite: **12/12** emulator rules
tests passing.

## Updated prevention guidance

- **Use the emulator suite as the budget oracle.** `npm run test:firestore-rules`
  now enforces the cap for real — add a boundary test (maximal create, wide
  multi-field update) whenever you touch a CubeSync validator, and let it, not a
  hand count, tell you whether you're under budget.
- **The hand-count in *Where the expression budget went* under-estimates real
  cost by a wide margin.** Treat any per-field or per-row validator over a
  ~30-field / multi-row payload as a cap risk until the emulator says otherwise.
- **Prefer keys + enums + bounds + shape in rules; push content/length
  validation to the client and API.** This is now the standard for the whole
  CubeSync block, not just `results`.
