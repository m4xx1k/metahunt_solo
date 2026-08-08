# Next session — canonical position grain

## Start here

Read `canonical-vacancy-grain.md`, ADR-0012 and ADR-0013. Do not restart the
design: the public grain is **position** (`unique_vacancies`), while
`vacancies` is a source posting. Freshness is a query filter, never an
`active` state.

## Live production state — 2026-08-08

- PRs #165, #166 and #167 are merged/deployed: 0039/0040/0041 + Phase 1b/1c.0.
- Prod invariants after 0040: 0 ungrouped postings; 0 pending rows; 0 stale
  vacancy/source counters; 0 stale first/last publication rollups; 0 missing
  representative / first-loaded fields.
- A real `rss-ingest-hourly` run created one new posting with a group immediately;
  the following `dedup-sweep` resolved it. The post-run checks found 0 new
  ungrouped, pending, missing-group, or bad-rollup rows.
- `dedup-sweep` Temporal schedule runs every five minutes.
- One duplicate Railway deploy failed because two pre-deploy migrations raced;
  the other deployment succeeded, the migration ledger is correct (41 rows),
  and the live healthcheck is green. Do not repair the ledger manually.

## Backup, rollback, and tomorrow's verification

Known fresh production dump: `backups/Postgres-1786137672124.sql.gz` (created
2026-08-07 21:22 local, 260,671,747 bytes). Before any destructive recovery,
verify the file and restore it only into the local Docker database:

```bash
gzip -t backups/Postgres-1786137672124.sql.gz
./scripts/db-restore.sh backups/Postgres-1786137672124.sql.gz
```

`db-restore.sh` drops its *local* target database after an interactive prompt;
never point it at Railway. No production connection URL belongs in this file.

Rollback by phase:

- 1a/0040: schema/data are additive and reconciled; do not hand-edit the
  migration ledger. If the app regresses, redeploy the previous app version.
- 1b/1c.0: revert the application deploy; `deduplicated_at` and deferred FKs
  remain compatible with the prior code.
- 1c.1 (work in progress): `DROP NOT NULL` is the immediate rollback. The real
  production ingest has already proved 1c.0.

The required #167 production proof is complete: one real new posting had a
group at insert time, received `deduplicated_at` after the next sweep, and
left reconciliation/orphan/ungrouped counts at zero. Do not re-run it unless
investigating a regression.

The query pattern for a future production check is:

```bash
prod_db_url="$(scripts/prod-db-url.sh)"
psql "$prod_db_url" -X -P pager=off -c '
  SELECT count(*) FILTER (WHERE unique_vacancy_id IS NULL) AS ungrouped,
         count(*) FILTER (WHERE deduplicated_at IS NULL) AS pending
  FROM vacancies;'
```

## Start tomorrow: MET-128 / Phase 1c.1

The original one-step `NOT NULL` plan was incomplete because vacancy and group
form a creation cycle. The safe order is now:

Worktree: `/tmp/metahunt-position-fk-contract`, branch
`feat/position-fk-contract`. It contains an uncommitted generated custom
`0042_require_position_group.sql` that makes `unique_vacancy_id NOT NULL` and
changes the FK to deferred `NO ACTION`.

The suite currently fails only at TypeScript compile time. Complete it:

1. Change `VacancyUpsertValues` to omit `id` and `uniqueVacancyId`; the
   repository creates the atomic UUID pair.
2. Repair raw ETL fixtures so every vacancy and singleton `unique_vacancies`
   group are inserted in one transaction with preallocated UUIDs.
3. Run `pnpm test:etl:int`, `pnpm --filter @metahunt/etl lint`, and
   `pnpm db:check`; commit, PR, merge, deploy, then run the invariant query.

Never combine 1c.1 with product-read changes. Linear:
[MET-128](https://linear.app/metahunt/issue/MET-128/enforce-mandatory-position-group-phase-1c1).

## Phase 2 — product read paths

After 1c.1, remove `coalesce(v.unique_vacancy_id, v.id)` throughout:

- market service counts positions, not postings;
- feed/facets/ranking/tracks use the direct FK / group representative;
- feed gets removable default `postedWithinDays=30`, applied to group
  `last_published_at` (currently named `last_seen_at` until standalone rename);
- landing/market stays all-time and renders unit + corpus span + as-of;
- write header-equals-list, freshness-window, repost, and group-date-sort
  integration tests specified in the main tracker.

The `first_seen_at` → `first_published_at` rename is cosmetic and must remain
its own compatibility-sensitive deploy.

## Data lab / Metalab

Do **not** start market analytics before Phase 2. Otherwise every denominator
measures reposting volume. Once Phase 2 is live, update
`metahunt-data-lab-agent-prompt.md` so every metric declares:

- grain: `posting` or `position`;
- denominator;
- time axis (`first_loaded_at` for cohort/trend first appearance;
  `last_published_at` for freshness/liveness);
- filter/window and `as_of` timestamp.

Keep IDF/node_stats/node_skill_cooc on posting grain until a separate ADR-0014
with before/after CV-match evidence. Digest de-dup by position is Phase 3.
The discovery/doc task is
[MET-129](https://linear.app/metahunt/issue/MET-129/metalab-define-position-grain-market-analysis),
blocked by MET-128 and Phase 2.
