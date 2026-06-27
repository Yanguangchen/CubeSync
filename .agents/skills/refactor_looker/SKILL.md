---
name: refactor-looker
description: Analyzes the codebase to identify refactoring candidates, such as code duplication, excessive function complexity, large modules, out-of-date styles, or anti-patterns, and provides a structured refactoring plan.
---

# Refactor Looker Skill

This skill provides a structured methodology to inspect a codebase for refactoring candidates, identify anti-patterns, evaluate architectural structure, and generate a prioritized refactoring execution plan.

---

## 1. Discovery & Inspection Guidelines

When triggered, follow these steps to find refactoring candidates:

### Step 1: Scan for Size and Complexity
* Identify the largest files in the codebase (e.g., >500 lines of JavaScript or CSS).
* Identify files containing a high number of functions (e.g., >15 functions) or functions with high line counts (e.g., >100 lines of code).
* Look for deeply nested callbacks or highly complex conditional blocks (high cyclomatic complexity).

### Step 2: Detect Code Duplication
* Search for common helper patterns implemented multiple times across different files:
  * Example: JSON response helpers, string normalization, query parameter parsing, environment loading.
  * Look for identical mock generators or wrapper structures duplicated across test suites.

### Step 3: Analyze Testability & Module Boundaries
* Identify files that cannot be imported/required cleanly due to browser globals (e.g., relying on `window`, `document`, or specific DOM nodes at load time).
* Look for modules combining multiple responsibilities (e.g., a single file doing API calls, DOM manipulation, business calculations, and styling triggers).

---

## 2. Refactoring Target Priority

Group candidates by the following priorities:

### 🔴 P0: High Priority (Critical Issues)
* **API/Security Duplication**: Security logic, token validation, or initialization patterns copied across multiple endpoints where a change in one could cause a security gap in another.
* **Untestable Logic Blobs**: Critical business logic tightly coupled to global variables or browser contexts that prevents standard unit testing.
* **Critical Bug-Prone Duplication**: Complex calculation methods duplicated in different files that are prone to drifting out of sync.

### 🟡 P1: Medium Priority (Code Health / Debt)
* **Monolithic Files**: Large modules (e.g., UI controllers like `dashboard.js`) that should be split into smaller, cohesive modules.
* **Configuration Coupling**: Hardcoded constants or magic strings that should be moved to a centralized configuration file or environment variables.
* **Inconsistent Module Standards**: A mix of CommonJS (`require`), ES Modules (`import`), and global IIFE patterns within the same project.

### 🟢 P2: Low Priority / Style (Polish)
* **Dead Code**: Unused exports, deprecated variables, or vestigial helper functions.
* **Formatting and Styles**: Standardizing variable naming, spacing, or JSDoc/inline comments.

---

## 3. Output Format: Refactoring Analysis Report

Create a Markdown artifact named `refactoring_analysis.md` in the current conversation directory containing the following:

```markdown
# CubeSync — Refactoring Analysis Report

**Date:** YYYY-MM-DD · **Scope:** [Project Scope]

---

## Executive Summary
*A brief summary highlighting the major architectural debt or code duplication patterns found, and their impact on maintenance and reliability.*

---

## Major Refactoring Targets

### 🔴 P0 — Critical Targets
1. **[Target Name/File]**
   - **Current State:** [Describe complexity or duplication, listing line numbers or references]
   - **Why it is a problem:** [Maintenance/security/reliability impact]
   - **Proposed Refactoring:** [Detailed steps to fix, e.g., extract helper into `utils/auth.js`]

### 🟡 P1 — Medium Priority Targets
...

### 🟢 P2 — Low Priority / Technical Debt
...

---

## Proposed Refactored Architecture
*A visualization or text outline of how the code structure will look after refactoring (e.g., new file layout, decoupled modules, unified helpers).*
```
