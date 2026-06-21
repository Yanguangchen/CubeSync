# Bug: cubesync-autocomplete.js and cubesync-table-manager.js return 404 in production

**Labels:** bug, deployment

## Description

`cubesync-autocomplete.js` and `cubesync-table-manager.js` fail to load in production with a 404 status. Both scripts are referenced in `index.html`, `dashboard.html`, and `glassmorphic.html` via `<script>` tags but were never copied to the `public/` output directory during the build.

## Root cause

The build script (`scripts/write-env.js`) maintains a `STATIC_FILES` array that lists every file to copy from the repo root into `public/`. When `cubesync-autocomplete.js` and `cubesync-table-manager.js` were added to the HTML files, they were not added to `STATIC_FILES`. Since Vercel serves from `public/` (configured in `vercel.json`), these files were missing in production.

## Affected pages

- `index.html` (Concrete Cube Test Request Form)
- `dashboard.html` (Concrete Cube Dashboard)
- `glassmorphic.html` (Glassmorphic view)

## Fix

Added both files to the `STATIC_FILES` array in `scripts/write-env.js`:

```diff
  "chime.js",
+ "cubesync-autocomplete.js",
  "cubesync-form-data.js",
  "cubesync-form-markup.js",
  "cubesync-export.js",
+ "cubesync-table-manager.js",
  "dashboard.js",
```

## Tests added

Two new tests in `deployment-config.test.js` prevent this class of bug from recurring:

1. **"every script referenced in HTML is included in build STATIC_FILES"** — parses all `<script src>` attributes from HTML files and asserts each local script name appears in the build script's `STATIC_FILES` array.
2. **"build copies HTML-referenced scripts to public output"** — runs the full build in a temp directory and verifies every HTML-referenced script exists in `public/` afterward.

## How to prevent in future

A comment has been added above `STATIC_FILES` in `scripts/write-env.js` reminding contributors that any new `<script src>` must be reflected in the array. The automated tests will catch omissions in CI.
