# Migration — repository / port layer

**Branch:** `refactor/repository-layer` · **Status:** in-progress · **Started:** 2026-05-29

## Why

A backend audit flagged the #1 cross-cutting
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

## Done (slice 1 — loader resolvers)

- `loader/repositories/company.repository.ts`, `loader/repositories/node.repository.ts` — new.
- `CompanyResolverService`, `NodeResolverService` — now inject the repository, pure orchestration.
- Both specs rewritten to mock the repository and assert on **real arguments** (normalization,
  slugify, race recovery) — previously impossible.
- `loader.module.ts` wires the two repository providers.

## Done (slice 2 — vacancy loader)

- `loader/repositories/vacancy.repository.ts` — new. `findRecord` + `upsertWithSkills` (owns the
  `db.transaction`, so the vacancy row + `vacancy_nodes` rewrite stay atomic).
- **Killed the `vacancyValues` insert/update duplication** (audit §2.5): the `onConflictDoUpdate`
  SET is now derived from the insert values via `omit(IMMUTABLE_ON_UPDATE)` — add a field once.
- `VacancyLoaderService` — no more `DRIZZLE`; pure mapping + a `resolveSkillLinks` private method
  (was a ~135-line god-method). Spec rewritten to mock the repo, asserts mapping + skill links;
  added a "required wins over optional" case.
- Verified: full `src/loader` suite 54/54 green, `tsc --noEmit` clean (both slices).

## Done (slice 3 — end-to-end load atomicity)

- `loader/repositories/executor.ts` — `Executor = DrizzleDB | <tx>` type, derived from the
  transaction callback so it tracks the Drizzle version.
- Company/Node repository methods take an optional `executor` (defaults to `this.db`); the two
  resolver services thread it through.
- `VacancyRepository` gains `runInTransaction(work)`; `upsertWithSkills` now runs on the passed
  executor instead of opening its own tx.
- `VacancyLoaderService.loadFromRecord` opens **one** transaction and runs company/node
  resolution AND the vacancy upsert on it — closes the §2.5 orphan-rows gap (a crash mid-resolve
  no longer commits company/node rows behind a vacancy that never landed).
- Specs assert the executor is threaded to every repo/resolver call (sentinel tx) + that the
  record-missing path throws *before* opening a tx. Full `src/etl` suite 148/148 green, tsc clean.

## Done (slice 4 — integration test harness)

The repository refactor made the loader unit-of-work Temporal-agnostic, so it's
testable against a real DB with no Temporal/S3.

- **Testcontainers** (`@testcontainers/postgresql` + `pgvector/pgvector:pg17`): one ephemeral
  Postgres per run, migrations applied in `test/int/global-setup.ts`, stopped in
  `global-teardown.ts`. Same code path locally and in CI — no manual `db:up`, no dev-DB pollution.
- Separate `jest.int.config.ts` (`test/int/**/*.int.spec.ts`) so `pnpm test` stays fast and
  Docker-free; `pnpm test:int` / root `pnpm test:etl:int` opt in.
- `test/int/vacancy-loader.int.spec.ts` — real repos + services vs live PG: happy-path load,
  upsert idempotency (skills rewritten), and the **headline rollback test** (vacancy write throws
  after resolution → 0 orphan company/node rows = slice-3 atomicity proven on a real DB).
- CI: new `test-etl-int` job runs `pnpm test:etl:int` on the runner's Docker. Near-zero cost
  (~1–3 min, no separate DB billing).
- `pnpm-workspace.yaml`: acknowledged ssh2/cpu-features build scripts as `false` (testcontainers'
  optional remote-Docker SSH deps; unused with the local socket).

> Not covered (deliberately): the RSS/extract activities (S3 + not yet repo-fied → slice 7) and
> Temporal workflow replay (would use `@temporalio/testing`, separate effort).

## Remaining candidates (not started — pick up here)

Same pattern, in rough value order:
1. **`MonitoringService` / `VacanciesService` / `ExtractionCostService`** — read-side raw-SQL
   aggregates → query repositories.
3. **`dedup.service.ts`** — highest audit priority (§2.4) but largest; extract the candidate
   SQL + scoring into a repository + pure scoring functions there.
4. **RSS activities** (`rss-parse`, `rss-fetch`) — DB/S3 behind repos so activities become
   orchestration shells (audit §2.1/§2.3).

Keep slices small; each should leave the suite green and add a no-DB unit test.
