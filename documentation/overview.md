# CubeSync Architecture Overview

This document provides a high-level overview of the CubeSync architecture. For detailed UML diagrams (Component, Class, Sequence, State, and ER), please refer to [architecture.md](architecture.md).

## System Overview

CubeSync is a digital transformation of the paper-based concrete cube request process. It consists of a suite of web pages, shared utility modules, and a serverless backend for secure data submission.

## Core Components

### 1. Frontend Pages
- **Request Forms:** `index.html` (Original) and `glassmorphic.html` (Stepped). Powered by `app.js`.
- **Human Dashboard:** `dashboard.html`. Powered by `dashboard.js`. Provides CRUD operations for internal staff.
- **RPA Queue:** `rpa-dashboard.html`. Optimized for bot consumption with CSV/ZIP export.

### 2. Shared Modules (UMD)
- **`barcode.js`:** Code 128-B encoding and SVG rendering.
- **`cubesync-form-data.js`:** Centralized schema and data transformation logic.
- **`cubesync-export.js`:** Utility for generating CSV files and ZIP archives.
- **`firestore.js`:** Wrapper for Firebase Auth and Firestore SDKs.

### 3. Backend & Security
- **Public Submission API:** `/api/cube-request-submit.js` (Vercel Function).
- **reCAPTCHA v2:** Integrated into the form submission flow to prevent spam.
- **Firebase Admin SDK:** Used by the API to write to Firestore with elevated privileges after reCAPTCHA verification.

## Security Model

CubeSync uses a tiered security approach:
- **Public (Customer):** Access to submission forms. Protected by reCAPTCHA v2. Submissions go through the API proxy.
- **Internal (Staff):** Access to dashboards. Protected by Google OAuth and an application-level email allowlist (`CUBESYNC_ALLOWED_EMAILS`).

## Data Flow

1. **Submission:** User fills form -> `app.js` captures data -> reCAPTCHA challenge -> POST to `/api/cube-request-submit` -> Verification -> Write to Firestore.
2. **Management:** Staff signs in -> `dashboard.js` loads forms from Firestore -> CRUD operations -> Sync back to Firestore.
3. **Automation:** RPA bot loads `rpa-dashboard.html` -> Exports CSV/ZIP -> Downloads files for ERP entry.

For more information, see:
- [Design System](design.md)
- [RPA Selector Reference](RPA_SELECTOR_REFERENCE.md)
- [README](README.md)
