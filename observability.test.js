const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createApiRequestLogger,
  logServerEvent,
  safeCorrelationId,
  sanitizeForLog
} = require("./api/_utils/firebase-api-helper");
const { Observability } = require("./cubesync-form-data");

function captureConsole(methods, callback) {
  const originals = {};
  const calls = [];
  methods.forEach((method) => {
    originals[method] = console[method];
    console[method] = (...args) => calls.push({ method, args });
  });

  try {
    callback(calls);
  } finally {
    methods.forEach((method) => {
      console[method] = originals[method];
    });
  }
  return calls;
}

test("server log sanitizer redacts secrets and PII without losing safe diagnostics", () => {
  const circular = { safeCount: 3 };
  circular.self = circular;
  const sanitized = sanitizeForLog({
    authorization: "Bearer top-secret",
    nested: [{ recaptcha_token: "captcha-secret", safeCount: 2 }],
    contact: "Jane Doe",
    note: "user@example.com failed with Bearer abc.def.ghi",
    circular
  });

  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.nested[0].recaptcha_token, "[REDACTED]");
  assert.equal(sanitized.nested[0].safeCount, 2);
  assert.equal(sanitized.contact, "[REDACTED]");
  assert.equal(sanitized.note, "[REDACTED_EMAIL] failed with Bearer [REDACTED]");
  assert.equal(sanitized.circular.safeCount, 3);
  assert.equal(sanitized.circular.self, "[CIRCULAR]");
});

test("server events are single-line JSON with queryable level, timing, and error fields", () => {
  const calls = captureConsole(["error"], () => {
    const payload = logServerEvent({
      feature: "Submission",
      functionName: "save",
      operation: "write",
      status: "failed",
      category: "DatabaseWrite",
      requestId: "vercel-request",
      correlationId: "client-operation",
      durationMs: 12.4,
      httpStatus: 500,
      metadata: { token: "secret", rowCount: 4 },
      error: Object.assign(new Error("Failed for person@example.com"), { code: "internal" })
    });
    assert.equal(payload.level, "error");
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.length, 1, "structured logs must be emitted as one JSON line");
  const event = JSON.parse(calls[0].args[0]);
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.source, "server");
  assert.equal(event.event, "Submission.write");
  assert.equal(event.requestId, "vercel-request");
  assert.equal(event.correlationId, "client-operation");
  assert.equal(event.durationMs, 12);
  assert.equal(event.httpStatus, 500);
  assert.equal(event.metadata.token, "[REDACTED]");
  assert.equal(event.metadata.rowCount, 4);
  assert.equal(event.error.code, "internal");
  assert.equal(event.error.message, "Failed for [REDACTED_EMAIL]");
});

test("API request logger pairs start and completion events with propagated correlation", () => {
  const headers = {};
  const response = { setHeader: (name, value) => { headers[name] = value; } };
  const calls = captureConsole(["log"], () => {
    const logger = createApiRequestLogger({
      method: "POST",
      headers: {
        "x-vercel-id": "sin1::vercel-request",
        "x-cubesync-request-id": "submission-client-id"
      }
    }, response, "/api/example");
    logger.start({ bodyBytes: 42 });
    logger.complete(201, { metadata: { recordCount: 1 } });
  });

  assert.equal(headers["X-CubeSync-Request-Id"], "submission-client-id");
  assert.equal(calls.length, 2);
  const [started, completed] = calls.map((call) => JSON.parse(call.args[0]));
  assert.equal(started.event, "http.request.started");
  assert.equal(completed.event, "http.request.completed");
  assert.equal(started.requestId, "sin1::vercel-request");
  assert.equal(completed.requestId, started.requestId);
  assert.equal(started.correlationId, "submission-client-id");
  assert.equal(completed.correlationId, started.correlationId);
  assert.equal(completed.route, "/api/example");
  assert.equal(completed.method, "POST");
  assert.equal(completed.httpStatus, 201);
  assert.ok(completed.durationMs >= 0);
});

test("correlation identifiers reject unsafe or oversized header values", () => {
  assert.equal(safeCorrelationId("safe-id_123::region"), "safe-id_123::region");
  assert.equal(safeCorrelationId("contains spaces"), "");
  assert.equal(safeCorrelationId("x".repeat(129)), "");
});

test("client events use the same schema and redact nested metadata", () => {
  const calls = captureConsole(["warn"], () => {
    const payload = Observability.logClientEvent({
      feature: "Dashboard",
      functionName: "save",
      operation: "update",
      status: "warning",
      category: "DatabaseWrite",
      correlationId: "client-correlation",
      durationMs: 9.7,
      metadata: { contact: "Jane", changedFieldCount: 2 },
      error: Object.assign(new Error("Bearer sensitive-token"), { code: "permission-denied" })
    });
    assert.equal(payload.level, "warn");
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.length, 1);
  const event = JSON.parse(calls[0].args[0]);
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.source, "client");
  assert.match(event.sessionId, /^session-/);
  assert.equal(event.correlationId, "client-correlation");
  assert.equal(event.durationMs, 10);
  assert.equal(event.metadata.contact, "[REDACTED]");
  assert.equal(event.metadata.changedFieldCount, 2);
  assert.equal(event.error.code, "permission-denied");
  assert.equal(event.error.message, "Bearer [REDACTED]");
});

test("global client handlers capture uncaught errors, promise rejections, and resource paths once", () => {
  const listeners = {};
  const target = {
    location: { href: "https://example.test/dashboard.html" },
    addEventListener(type, listener) {
      listeners[type] = listener;
    }
  };

  assert.equal(Observability.installGlobalErrorHandlers(target), true);
  assert.equal(Observability.installGlobalErrorHandlers(target), false, "installation must be idempotent");

  const calls = captureConsole(["error"], () => {
    listeners.error({
      target: { tagName: "SCRIPT", src: "https://cdn.example.test/app.js?token=secret" }
    });
    listeners.unhandledrejection({ reason: new Error("Async failed") });
  });

  assert.equal(calls.length, 2);
  const resourceEvent = JSON.parse(calls[0].args[0]);
  const rejectionEvent = JSON.parse(calls[1].args[0]);
  assert.equal(resourceEvent.category, "ResourceLoad");
  assert.equal(resourceEvent.metadata.resourcePath, "/app.js");
  assert.equal(rejectionEvent.category, "UnhandledPromiseRejection");
  assert.equal(rejectionEvent.error.message, "Async failed");
});
