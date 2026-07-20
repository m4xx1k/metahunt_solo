# Runbook — REST API Contract

## Published OpenAPI contract

Swagger UI is available at `/docs` and JSON at `/docs/openapi.json` only when
`NODE_ENV` is not `production`. Production deliberately exposes neither route.
This keeps a useful local/staging contract without making an additional public
production surface.

The published contract covers these product groups:

- `system` — liveness and dependency health.
- `auth` — Telegram login and current session.
- `feed`, `ranking`, `tracks`, `market` — public vacancy discovery.
- `subscriptions`, `waitlist`, `account` — activation and authenticated account state.
- `operator:*` — authenticated administrator-only operations.

The private `/cv` API is deliberately excluded from the public Swagger contract.
It requires an authenticated owner and has its own retention/deletion boundary
documented in [`cv-privacy.md`](cv-privacy.md). Exclusion from documentation is
not a security control.

## Authorization boundary

Every `operator:*` controller requires a valid Bearer JWT with the `admin`
role. This includes RSS triggering/recovery, loader backfills and cleanup,
manual digest delivery, raw monitoring, dedup review, extraction-cost reporting,
and taxonomy reads/writes. A public route must be explicitly justified by a
product flow; rate limiting is never an authorization substitute.

## Contract rules

- Public product APIs return only the data needed by the product UI.
- Authenticated account routes scope every resource by the JWT user id.
- Operator routes use `Authorization: Bearer <token>` and must return `401` for
  missing/invalid tokens and `403` for non-admin users.
- Validation errors use Nest's standard `{ statusCode, message, error }` shape.
- Add request/response DTO classes when a route has a stable external payload;
  do not expose persistence models or raw provider payloads as contract types.
- A breaking API change requires an explicit consumer check and an OpenAPI
  update in the same change.

## Verification

Run:

```bash
pnpm --filter @metahunt/database build
pnpm --filter @metahunt/etl test
pnpm --filter @metahunt/etl lint
pnpm --filter @metahunt/etl build
```

For local inspection, run the ETL with a non-production `NODE_ENV` and open
`http://localhost:<port>/docs`. Never use a production token or trigger an
operator mutation merely to inspect Swagger.
