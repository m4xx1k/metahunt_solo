# Errors & logging

Predictable failure modes and observable behavior. They go together: every failure that crosses a boundary should produce a log entry.

## Errors

### Categories

| Category | HTTP | Example |
|---|---|---|
| Validation | 400 | Missing required field, malformed UUID |
| Not found | 404 | Unknown id |
| Authn | 401 | Expired or missing token |
| Authz | 403 | Wrong role for this resource |
| Conflict | 409 | Duplicate unique key, stale optimistic lock |
| External | 502 / 503 | Upstream API down |
| Internal | 500 | Unhandled |

### Throw typed errors, not strings

Use NestJS built-ins (`BadRequestException`, `NotFoundException`, `ForbiddenException`, …) at HTTP boundaries. For domain rules, a small named class with a `code` and a meaningful message. Never `throw 'foo'`.

### Don't expose internals

User-facing message: "Payment service unavailable". Logs and traces hold the stack and the upstream response.

### Don't swallow

`catch (err) { /* ignore */ }` is almost always a bug. Either handle it (recover, retry, fall back, log + rethrow) or let it propagate.

### Retry only what's idempotent and transient

- 5xx, network timeouts, explicit `SERVICE_UNAVAILABLE` / `TIMEOUT` codes — retry with exponential backoff and a cap.
- 4xx — don't retry; the request is wrong.
- Non-idempotent operations (POSTs that create rows, payments) — only retry with an idempotency key.

### Circuit-break repeated upstream failures

When an external dep fails N times in a row, stop calling it for T seconds. Saves the dep, fails fast for callers. Reset on first success.

## Logging

### Levels

- **error** — system broke, needs attention. Page-worthy.
- **warn** — handled but unusual (retry succeeded after failure, deprecated path used, slow query).
- **info** — business events (workflow started/finished, source ingested, record extracted).
- **debug** — dev/troubleshooting (gated by `LOG_LEVEL=debug`).

### Structure

Always log structured JSON, never `console.log("foo:", obj)`. Each entry has `level`, `message`, `timestamp`, plus context fields.

Required context where available:

- `requestId` (HTTP) / `workflowId` + `runId` (Temporal)
- domain ids: `sourceId`, `recordId`, `ingestId` for ETL
- `durationMs` for any external call (DB, S3, OpenAI, Temporal)

### Never log

- Secrets, API keys, tokens, passwords.
- PII beyond the identifier you actually need (log `userId`, not the email).
- Full request / response bodies (log a summary: `itemCount`, `status`, `bytes`).

### What to log

- Workflow boundaries (started, completed, failed) — info.
- External call + duration + status — info or debug.
- Slow queries (>1s) — warn.
- Auth events (success, failure, lockout) — info / warn.
- Caught and recovered errors — warn.
- Uncaught / domain errors — error, with stack and full context.
