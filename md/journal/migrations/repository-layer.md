# Migration — repository / port layer

**Branch:** `refactor/repository-layer` · **Status:** in-progress · **Started:** 2026-05-29

## Why

Backend audit ([`BACKEND_AUDIT.md`](../../../BACKEND_AUDIT.md) §2.1) flagged the #1 cross-cutting
debt: DB access (Drizzle + raw SQL) is interleaved with business logic everywhere, so domain
services can't be unit-tested without a live Postgres. Pre-existing resolver specs proved it —
they mocked the Drizzle query-builder chain (`select().from().where()`, `insert().values()
.onConflictDoNothing().returning()`) and even admitted "we can't easily inspect the eq() args".

Goal: introduce thin repository (DB-gateway) classes so domain services depend on an interface,
not on `DRIZZLE`. Pragmatic, incremental — not a big-bang rewrite.

## Pattern established

- Repository = `abstract class` (doubles as the Nest DI token) + a `Drizzle<X>Repository` impl.
- Methods are intention-revealing and return domain-shaped values (`string | null`), hiding the
  builder mechanics. `insertReturningId` returns `null` when a concurrent insert won the race.
- Module binds `{ provide: XRepository, useClass: DrizzleXRepository }`.
- Service holds only orchestration (resolve-or-create, race recovery, normalize/slugify) and is
  constructed with the repo directly in tests — no Nest `TestingModule`, no DB.

## Done (first slice — loader resolvers)

- `loader/repositories/company.repository.ts`, `loader/repositories/node.repository.ts` — new.
- `CompanyResolverService`, `NodeResolverService` — now inject the repository, pure orchestration.
- Both specs rewritten to mock the repository and assert on **real arguments** (normalization,
  slugify, race recovery) — previously impossible.
- `loader.module.ts` wires the two repository providers.
- Verified: full `src/loader` suite 54/54 green, `tsc --noEmit` clean.

## Remaining candidates (not started — pick up here)

Same pattern, in rough value order:
1. **`VacancyLoaderService`** — biggest win but needs a repo that accepts a transaction context
   (the upsert + `vacancy_nodes` rewrite run inside `db.transaction`). Resolve the audit's §2.5
   "resolution outside the transaction" non-atomicity at the same time.
2. **`MonitoringService` / `VacanciesService` / `ExtractionCostService`** — read-side raw-SQL
   aggregates → query repositories.
3. **`dedup.service.ts`** — highest audit priority (§2.4) but largest; extract the candidate
   SQL + scoring into a repository + pure scoring functions there.
4. **RSS activities** (`rss-parse`, `rss-fetch`) — DB/S3 behind repos so activities become
   orchestration shells (audit §2.1/§2.3).

Keep slices small; each should leave the suite green and add a no-DB unit test.
