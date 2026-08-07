# Observability

CubeSync emits structured, privacy-filtered JSON events for API requests and browser operations. The contract is designed so a public submission can be followed from the browser request through reCAPTCHA, field-config lookup, Firestore creation, and the final HTTP response without logging the submitted form or authentication secrets.

## Event contract

Every event is emitted as one JSON line. Server events go to Vercel runtime logs; client events go to the browser console. All events use `schemaVersion: 1`.

| Field | Meaning |
|-------|---------|
| `timestamp` | ISO-8601 event time. |
| `level` | `info`, `warn`, or `error`. |
| `source` | `server` or `client`. |
| `event` | Stable event name, such as `http.request.completed`. |
| `message` | Short human-readable summary. |
| `feature` / `operation` | Product area and action. |
| `status` / `category` | Outcome and failure domain. |
| `route` / `method` / `httpStatus` | HTTP context when applicable. |
| `requestId` | Vercel request id (`x-vercel-id`) or a generated server id. |
| `correlationId` | Browser-generated operation id propagated through `X-CubeSync-Request-Id`. |
| `sessionId` | Ephemeral browser-page session id; it contains no user identity. |
| `durationMs` | Rounded elapsed milliseconds. |
| `safeId` | Firestore document id when useful for support. |
| `metadata` | Allowlisted diagnostic counts, booleans, and enums—not request payloads. |
| `error` | Sanitized `name`, `code`, and `message`; no stack or raw error object. |

Do not rename fields or change their types without incrementing `schemaVersion` and updating `observability.test.js`.

## Request lifecycle

Both API handlers use the same lifecycle:

1. `http.request.started` is emitted when the handler begins.
2. Dependency events report reCAPTCHA, Firestore read, and Firestore write outcomes with `durationMs`.
3. `http.request.completed` or `http.request.failed` is emitted exactly once before the response.
4. Every event in the invocation carries the same `requestId` and `correlationId`.

The browser generates `X-CubeSync-Request-Id` for submission and dropdown-option API calls. The server validates it, echoes it in the response header, and records it as `correlationId`. When Vercel supplies `x-vercel-id`, that separate value is retained as `requestId`.

Useful server events include:

| Event | What it proves |
|-------|----------------|
| `http.request.started` | Handler invocation reached application code. |
| `CubeSubmission.fetchGoogleRecaptcha` | Google verification request completed or failed. |
| `CubeSubmission.fetchFormFieldConfig` | Optional field configuration read outcome. |
| `CubeSubmission.validatePayload` | Server-side validation rejection. |
| `CubeSubmission.createSubmission` | Firestore document creation and safe document id. |
| `DropdownOptions.overwriteOptions` | Managed option lists were replaced. |
| `DropdownOptions.unionOptions` | Reviewed option values were appended. |
| `http.request.completed` | Final HTTP status and end-to-end duration. |

Browser runtime handlers also capture uncaught errors, unhandled promise rejections, and failed resource paths. Resource query strings are removed before logging.

## Privacy and cardinality

The sanitizer recursively redacts authentication data and common customer identifiers, including passwords, tokens, API/private keys, authorization headers, email, phone/contact, addresses, customer/client/project names, barcodes, request bodies, and payloads. It also:

- redacts bearer tokens, JWTs, token-like query parameters, and email addresses embedded in strings;
- handles nested objects, arrays, `Error` values, circular references, and excessive depth;
- truncates strings at 1,000 characters, arrays at 50 entries, and objects at 100 fields;
- excludes stack traces, user-agent strings, IP addresses, reCAPTCHA responses, form values, and auth identities from the event contract.

Only low-cardinality diagnostic metadata should be added: counts, booleans, fixed enums, and stable operation names. Never attach a form payload merely because the sanitizer exists.

## Production investigation

Start with the Vercel deployment's Runtime Logs and filter for one of:

- a customer-provided `correlationId`;
- a Vercel `requestId`;
- a `safeId` returned after creation;
- `event = http.request.failed` for broad failure scans.

For a submission failure, reconstruct the sequence in timestamp order:

1. Confirm `http.request.started` exists.
2. Inspect reCAPTCHA latency/outcome.
3. Check whether field-config read failed but validation continued with defaults.
4. Look for `CubeSubmission.validatePayload` or `CubeSubmission.createSubmission`.
5. Confirm the final event's `httpStatus`, `durationMs`, and sanitized error code/message.

High-signal conditions worth alerting on or reviewing regularly:

- any sustained increase in `http.request.failed` for `/api/cube-request-submit`;
- repeated `ExternalServiceCall` failures or unusually high reCAPTCHA `durationMs`;
- any `DatabaseWrite` failure;
- repeated `ConfigError` events;
- completion events missing after corresponding start events;
- client `UnhandledError` or `UnhandledPromiseRejection` reports reproduced in staff browsers.

Client console events are not automatically forwarded to Vercel runtime logs. Ask for the browser console JSON line when diagnosing a browser-only failure, then use its `correlationId` to find the related server invocation. A production client-error collector would require a separately secured, rate-limited ingestion design.

## Local verification

Run the contract tests directly:

```sh
node --test observability.test.js api-handler.test.js api-handler-unit.test.js api-dropdown-options.test.js firestore-runtime.test.js
```

Before deployment, also run:

```sh
npm test
npm run lint
npm run build
```

For current Vercel CLI compatibility, upgrade first with `npm i -g vercel@latest`, then use the deployment Runtime Logs or the current CLI log commands for post-deploy checks.

