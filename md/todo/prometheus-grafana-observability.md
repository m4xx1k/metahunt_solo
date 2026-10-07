# TODO — Prometheus + Grafana observability

**Status:** completed · **Opened:** 2026-08-25 · **Completed:** 2026-10-08 · **Driver:** learn the stack hands-on (it is
on almost every backend job ad) while getting real pipeline visibility out of it.


## Why this repo is a good fit

The usual pet-project problem with Prometheus is that there is nothing worth graphing.
Here there is: the ETL pipeline already produces natural counters and durations —
RSS ingest runs per source, extraction success/failure, LLM cost, dedup merges,
Temporal workflows, Telegram digest sends. That yields a real RED dashboard instead
of a demo.

No overlap with what already exists:

| layer | tool | question it answers |
|---|---|---|
| product | PostHog | did the user convert |
| LLM traces | Langfuse | what did the model do on this call |
| **infra / pipeline** | **Prometheus + Grafana** | **is the system healthy right now** |

`@opentelemetry/sdk-node` is already a dependency but it is only wired for Langfuse
tracing (`apps/etl/src/eval/extraction.experiment.ts`). Use `prom-client` for metrics —
simpler, and the job ads say "Prometheus", not "OTLP".

---

## Part 1 — `/metrics` endpoint (~30 min)

Files: new `apps/etl/src/platform/metrics/`, `apps/etl/src/app.module.ts`.

1. Add `prom-client` to `apps/etl/package.json`.
2. New `MetricsModule` in `platform/` (sits next to `health/`, `analytics/`):
   - a single shared `Registry` provider, exported so feature modules can register
     their own metrics against it;
   - `collectDefaultMetrics()` for process/heap/event-loop lag;
   - `MetricsController` with `GET /metrics` returning `registry.metrics()` and
     `Content-Type: text/plain; version=0.0.4`.
3. HTTP RED metrics via an interceptor: `http_request_duration_seconds` histogram
   labelled `method`, `route`, `status_code`. **Use the route pattern, never the raw
   URL** — `/vacancies/:id` as a label value, not the id.
4. Register `MetricsModule` in `AppModule` (`HealthController` is registered directly
   in `app.module.ts`; follow the module pattern instead since this one has providers).

### Auth

`OperatorApi`/`AdminOnly` is user-JWT + roles (`platform/auth/roles.guard.ts`) —
Prometheus cannot do that. Use a dedicated static token instead:

- new `METRICS_TOKEN` env var, added to `platform/config/env.validation.ts` and
  `.env.example`;
- a small guard comparing the `Authorization: Bearer` header with a
  timing-safe compare; skip the guard when the var is unset so local dev is open.
- Prometheus side: `authorization: { credentials: ... }` in the scrape config.

Also confirm `/metrics` keeps the global `X-Robots-Tag: noindex` from `main.ts` (it
will — the middleware is app-wide) and that the ThrottlerGuard does not rate-limit
the scraper (300/min default is plenty at a 15s interval, but mark it `@SkipThrottle`).

## Part 2 — local stack (~20 min)

Files: `compose.infra.yaml`, new `ops/prometheus/prometheus.yml`,
`ops/grafana/provisioning/`.

1. Two services on the existing `metahunt-infra` network:
   - `prom/prometheus` on `9090`, config mounted read-only, named volume for TSDB;
   - `grafana/grafana` on `3001` (3000 is free but keep it clear of the ETL default),
     named volume for its DB.
2. `prometheus.yml`: scrape `etl:3333/metrics` by service name (the compose network),
   15s interval.
3. Provision Grafana declaratively — datasource YAML + dashboard JSON under
   `ops/grafana/provisioning/` — so the dashboard is in git and survives a volume wipe.
   Do **not** hand-click the dashboard and leave it only in the container.
4. `pnpm` scripts + a note in `md/runbook/docker-dev.md`.

## Part 3 — domain metrics (1–2 h — this is the actual work)

Instrument the pipeline stages. Suggested first set:

| metric | type | labels |
|---|---|---|
| `ingest_runs_total` | counter | `source`, `status` |
| `ingest_records_total` | counter | `source` |
| `ingest_duration_seconds` | histogram | `source` |
| `extraction_total` | counter | `status` (mirrors `extraction-status.ts`) |
| `extraction_duration_seconds` | histogram | — |
| `extraction_cost_usd_total` | counter | `model` |
| `dedup_merges_total` | counter | — |
| `digest_sends_total` | counter | `status` |

Rules to hold to (this is the part interviewers actually probe):

- **No unbounded label values.** `source`, `status`, `model` are fine; `vacancyId`,
  `userId`, `url`, raw error strings are not — each distinct value is a new time series.
- Counter for "how many happened", gauge for "how many right now", histogram for
  "how long / how big". Never a gauge for a running total.
- Counters reset when the ETL redeploys on Railway. That is expected; query with
  `rate()`/`increase()`, which handle resets.

## Part 4 — dashboard + one real alert (~1 h)

1. One Grafana dashboard: HTTP RED row, pipeline row (ingest/extraction/dedup),
   process row (heap, event loop lag), exported to JSON into `ops/grafana/`.
2. **At least one alert rule that can actually fire** — this is what separates
   "I looked at graphs" from "I set up monitoring". Candidates:
   - no successful ingest from any source for > 2 h;
   - extraction error rate > 20 % over 15 min;
   - `/healthz` dependency down.
3. Route it to Telegram (a bot already exists in `04-notify/telegram`) or Grafana's
   built-in contact point. Then **verify it fires** by breaking something on purpose.

## Part 5 — free extra exporters (optional, ~30 min each)

- **Temporal**: the server exposes Prometheus metrics natively (dynamic config
  `prometheus` listener); the TS SDK worker exposes Runtime telemetry with a
  Prometheus exporter. Gives workflow completed/failed/backlog for free.
- **Postgres**: `prometheuscommunity/postgres-exporter` against the compose `db`.

Together with Part 3 that makes three layers — infra / runtime / domain — which is
the story worth telling.

---

## Production: pick one

Local-only still teaches the whole loop, but "it alerted me in prod" is the stronger
claim. Options, cheapest first:

1. **Grafana Cloud free tier** (10k series) + remote-write from the local/Railway
   Prometheus or a Grafana Alloy agent. Prod metrics, prod alerts, $0. **Recommended.**
2. **Local/dev only.** Honest and fine, no prod alerting.
3. **Self-host on Railway.** Two extra services with volumes, ≈350 MB RAM, real
   monthly cost for a side project. Most "real", most expensive.

### Railway gotchas if going with 1 or 3

- Private networking is IPv6 — scrape `http://etl.railway.internal:3333/metrics`.
- Railway restarts the app on deploy; expect counter resets (see Part 3).
- `/metrics` must be token-guarded in prod (Part 1).

## Effort estimate

Parts 1+2 = one evening (live graphs the same night). Parts 3+4 = the rest of a
weekend. Part 5 and production are additive and can wait.

---

## Completed Implementation (2026-10-08)

All core parts (1–4) and production self-hosting on Railway (Option 3) are fully shipped, tested, and running live in production.

### 1. Application Layer (`apps/etl/src/platform/metrics`)
- **`MetricsModule` & `MetricsService`**: Provides a singleton Prometheus `Registry`, initializes standard Node.js process metrics (`collectDefaultMetrics`), domain counters, and histograms. Implements `OnModuleDestroy` to cleanly clear registries during teardown.
- **`MetricsController`**: Exposes `GET /metrics` formatted with `Content-Type: text/plain; version=0.0.4`. Annotated with `@SkipThrottle` to prevent scraper throttling while preserving global `X-Robots-Tag: noindex`.
- **`MetricsAuthGuard`**: Authenticates requests using `Authorization: Bearer <METRICS_TOKEN>` with constant-time SHA-256 hash comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks. Fails closed (`NODE_ENV === "production"` strictly requires non-empty `METRICS_TOKEN`).
- **`HttpMetricsInterceptor`**: Intercepts HTTP traffic and records `http_request_duration_seconds` histograms labeled by method, normalized route pattern (`req.baseUrl + req.route?.path`), and response status code (including proper `HttpException` status code extraction).
- **Domain Metrics Instrumentations**:
  - `ingest_runs_total` (counter, labels: `source`, `status`)
  - `ingest_records_total` (counter, labels: `source`)
  - `ingest_duration_seconds` (histogram, labels: `source`)
  - `extraction_total` (counter, labels: `status`)
  - `extraction_duration_seconds` (histogram)
  - `extraction_cost_usd_total` (counter, labels: `model`)
  - `dedup_merges_total` (counter)
  - `digest_sends_total` (counter, labels: `status`)

### 2. Local Infrastructure (`compose.infra.yaml`)
- `prometheus`: `prom/prometheus:latest` listening on `:9090` (configured via `ops/prometheus/prometheus.yml` scraping `etl:3333/metrics`).
- `grafana`: `grafana/grafana:latest` listening on `:3001` with declarative datasource and dashboard provisioning mounted read-only from `ops/grafana/provisioning/`.

### 3. Production Deployment on Railway
- **Prometheus Service**:
  - Image built from `ops/prometheus/Dockerfile.railway`.
  - Config: `ops/prometheus/prometheus.prod.yml` scraping `https://api.metahunt.app/metrics` using `bearer_token_file: /etc/prometheus/bearer.token`.
  - Storage: Railway persistent volume attached at `/prometheus` (5GB TSDB retention).
- **Grafana Service**:
  - Image built from `ops/grafana/Dockerfile.railway`.
  - Datasource provisioned to `http://prometheus.railway.internal:9090`.
  - Dashboard: `ops/grafana/provisioning/dashboards/metahunt.json` provisioned declaratively with dynamic `$datasource` variable.
  - Storage: Railway persistent volume attached at `/var/lib/grafana`.

### 4. Security Hardening & Railway Gotchas Solved
- **Railway Volume Ownership & Privilege Dropping**:
  - *Problem*: Railway volumes mount as `root:root` (UID 0:0, 0755), which prevents unprivileged daemons (`nobody` UID 65534 in Prometheus, `grafana` UID 472 in Grafana) from writing to TSDB / sqlite databases. Running container daemons as root violates security benchmarks.
  - *Fix*: Minimal startup script (`entrypoint.sh`) runs as root for <5ms to `chown` the volume mount, writes the bearer token file with mode `600`, and immediately drops privileges using `exec su -s /bin/sh nobody` (Prometheus) and `exec su -s /bin/sh grafana` (Grafana).
- **Grafana Provisioning Variable Syntax**:
  - *Problem*: Grafana datasource provisioning config parsed via Go's `os.ExpandEnv` does not support bash default expansion like `${VAR:-default}`. It parses it as the literal variable name `VAR:-default`, evaluating to `""` and triggering `error="parse \"\": empty url"`.
  - *Fix*: Explicitly specify the static internal service URL `http://prometheus.railway.internal:9090`.

