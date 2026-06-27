---
name: test-coverage-audit
description: Audits test coverage of a codebase using native V8/Node.js or nyc/Istanbul reports, identifies gaps (such as eval/JSDOM blind spots, untested security routes, low branch coverage), and generates a prioritized remediation action plan.
---

# Test Coverage Audit Skill

This skill provides a structured methodology to audit codebases for test coverage, identify critical gaps, detect test execution blind spots, and produce a prioritized remediation report.

---

## 1. Discovery & Analysis Phase

When asked to audit test coverage, follow these steps systematically:

### Step 1: Identify Environment & Run Configuration
* Look for test frameworks, runners, and coverage configurations in `package.json`, `jest.config.js`, `.nycrc`, `vitest.config.ts`, etc.
* Find the exact command to execute tests with coverage enabled (e.g., `node --test --experimental-test-coverage`, `npm run test:coverage`, `jest --coverage`).

### Step 2: Run Tests & Capture Output
* Execute the test command using execution tools.
* Capture both the test results (pass/fail count) and the coverage summary report (Line %, Branch %, Function % per file).

### Step 3: Analyze for Instrumentation Blind Spots
* Cross-reference the list of total source files in the project with the files listed in the coverage report.
* Identify any files that are **completely missing** from the coverage report.
* Look for files loaded via string-evaluation or JSDOM simulation patterns:
  * Look in test files for patterns like `fs.readFileSync("file.js")` combined with JSDOM execution.
  * Flag these files as "uninstrumented/eval blind spots" because native V8 or Jest tools will report 0% or omit coverage even if functional tests exercise them.

---

## 2. Risk & Gap Classification

Evaluate coverage gaps using the following severity framework:

### 🔴 P0: High Risk
* **Untested Security Routes / Gates**: Authorization checks, rate-limiting, CORS handling, or role validations that lack unit tests.
* **Untested Database / State Operations**: Write, delete, or transaction logic containing conditional branches that are never executed.
* **Complex Backend Logic**: Helper methods processing critical raw data (e.g., base64 credential parsing, encryption/decryption) with low or 0% coverage.
* **Massive Uninstrumented Files**: Large files (>20KB or containing >15 functions) that are tested only via `eval` blocks.

### 🟡 P1: Medium Risk
* **Branch Gaps (Under 80%)**: Files where overall line coverage is high, but crucial decision branches (e.g., `if/else` paths for network timeouts or API failures) are untested.
* **Function Gaps**: Exported utilities or helper methods that are never invoked by any test suite.
* **Complex UI Math / State Engines**: Specialized custom modules (e.g., custom toggle engines, layout managers) tested only indirectly through functional tests.

### 🟢 P2: Low Risk / Polish
* **Edge-case inputs**: Keyboard navigation, simple styling toggles, or minor validation helpers.
* **Boilerplate headers**: UMD headers, basic export blocks, or standard environment checks.

---

## 3. Output Format: Audit Report

Generate a Markdown artifact named `test_coverage_audit.md` inside the conversation/app data directory using the following template:

```markdown
# [Project Name] — Test Coverage Audit

**Date:** YYYY-MM-DD · **Tests:** [Pass Count] pass, [Fail Count] fail · **Runtime:** [X.Xs]

---

## Executive Summary
*Provide a 2-3 sentence overview of the test coverage health, highlighting the overall coverage metrics and the biggest structural blind spot or risk.*

| Metric | Value | Rating |
|--------|-------|--------|
| Total tests | [Count] | [✅/❌] |
| Line coverage | [XX.XX%] | [🟢 Excellent / 🟡 Acceptable / 🔴 Needs Attention] |
| Branch coverage | [XX.XX%] | [🟢/🟡/🔴] |
| Function coverage | [XX.XX%] | [🟢/🟡/🔴] |

---

## Coverage by Source File
*Divide source files into groups:*
* **Well-Covered** (Line % >= 90% and Branch % >= 80%)
* **Needs Attention** (Line % < 90% or Branch % < 80%)
* **Not Instrumented** (List files evaluated via JSDOM eval, string mock, etc.)

---

## Top Coverage Gaps & Remediation Actions

### 🔴 P0 — High Priority
1. **[Filename] ([Lines/Branches Untested])**
   - **Why it's a risk:** [Describe exact vulnerability, e.g., untested CORS headers, database write fallback]
   - **Remediation:** [Concrete step, e.g., Add block test to 'file.test.js' simulating auth failure]

### 🟡 P1 — Medium Priority
...

### 🟢 P2 — Low Priority / Polish
...

---

## Structural & Architectural Observations
*Describe testing patterns, runner bottlenecks, and recommendations for improving coverage tool configuration (e.g., setting up c8, Istanbul, or refactoring eval-based tests to ES modules).*
```
