# CubeSync Goals

This document is a working target list for CubeSync. It is intentionally audit-friendly: keep, edit, reject, or reprioritize each item as the product direction becomes clearer.

## Product Goals

- [ ] Replace paper concrete cube request forms with a reliable digital submission flow.
- [ ] Keep the public request form PDF-faithful enough for customers and staff to recognize the existing process.
- [ ] Provide a clearer stepped form experience where it improves completion and reduces customer mistakes.
- [ ] Give staff a dashboard for searching, reviewing, editing, deleting, and triaging submitted requests.
- [ ] Preserve stable canonical field names for internal operations, exports, selectors, and automation.
- [ ] Let staff configure visible public-form fields, result columns, labels, and custom request fields without code changes.
- [ ] Highlight free-text or non-standard values so staff can review customer-entered data before downstream use.

## Automation Goals

- [ ] Maintain a dependable RPA queue for bot-driven processing.
- [ ] Keep RPA selectors stable and documented before changing markup used by automation.
- [ ] Support CSV and ZIP exports that match operational needs.
- [ ] Track RPA and ERP status clearly enough for staff to understand processing state.
- [ ] Keep the read-only RPA form view optimized for automation and inspection rather than manual editing.

## Data And Security Goals

- [ ] Route public submissions through the serverless API instead of direct public Firestore writes.
- [ ] Protect public submissions with reCAPTCHA verification.
- [ ] Limit staff-only data access through Google OAuth, configured allowlists, and Firestore rules.
- [ ] Keep `firestore.js` and `firestore.rules` staff allowlists in sync.
- [ ] Store request data in a shape that supports dashboard editing, RPA processing, exports, and future reporting.
- [ ] Avoid exposing credentials, admin-only operations, or staff-only data through public pages.

## Reliability Goals

- [ ] Keep validation consistent across public forms, dashboard edits, and serialization.
- [ ] Prevent customer submissions from failing silently.
- [ ] Preserve barcode generation, dynamic result rows, test age calculation, and prefilling behavior.
- [ ] Make field-configuration caching predictable and recoverable.
- [ ] Keep mobile layouts usable for public forms and staff workflows.
- [ ] Maintain compatibility with the current Firebase and Vercel deployment model.

## Documentation Goals

- [ ] Keep architecture, design, RPA selector, schema, and operational documents aligned with implementation.
- [ ] Document behavior that automation depends on before changing it.
- [ ] Record postmortems and design decisions when defects reveal reusable lessons.
- [ ] Keep README links current and useful for onboarding, deployment, and testing.

## Quality Gates

- [ ] `npm run lint` passes before release.
- [ ] `npm run test` passes before release.
- [ ] `npm run build` succeeds with required environment variables available.
- [ ] Firestore rules are reviewed when request schema or staff access behavior changes.
- [ ] Public submission, dashboard review, edit/delete, RPA queue, export, and RPA view flows are smoke-tested for user-facing changes.

## Non-Goals For Now

- [ ] Do not make label overrides change canonical database keys or RPA/export field names.
- [ ] Do not bypass the submission API for public writes.
- [ ] Do not redesign staff workflows into marketing-style pages.
- [ ] Do not introduce broad new dependencies without a clear operational benefit.

## Open Audit Questions

- [ ] Which goals are mandatory for the next release?
- [ ] Which goals are long-term direction rather than current scope?
- [ ] Are any operational workflows missing from this list?
- [ ] Are any security or compliance constraints undocumented?
- [ ] Should this file become a release checklist, roadmap, or high-level product charter?
