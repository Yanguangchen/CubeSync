# CubeSync Concrete Cube Request Form

Static digital version of `Concrete Cube Request Form_e-Form.pdf`.

Open one of these files in a browser:

- `dashboard.html` for the frontend CRUD dashboard.
- `index.html` for the original PDF-style form.
- `glassmorphic.html` for the modern glassmorphic form using Outfit.

Enter text in any barcode field and the matching Code 128-B barcode is generated automatically.

For automation hooks, see `RPA_SELECTOR_REFERENCE.md`.

## Firestore rules safety

`firestore.rules` also contains WorkGrid rules from another sensitive app. Do not edit the underlying WorkGrid rule blocks for CubeSync work.

CubeSync-specific access must stay in the clearly marked `CUBESYNC-ONLY RULES` block for `cubeRequests`. That block allows read/write for authenticated Firebase users; dashboard access is gated by Google sign-in.

The CubeSync dashboard allowlist is maintained in `firestore.js` as `CUBESYNC_ALLOWED_EMAILS`. It mirrors the WorkGrid-listed emails plus CubeSync additions such as `ernestngcy@gmail.com`; do not add CubeSync-only users by editing WorkGrid rule code.

Run tests with:

```sh
npm test
```
