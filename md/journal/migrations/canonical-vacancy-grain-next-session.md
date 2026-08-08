# Next session — canonical position grain

## Start here

Read `canonical-vacancy-grain.md`, ADR-0012 and ADR-0013. Do not restart the
design: the public grain is **position** (`unique_vacancies`), while
`vacancies` is a source posting. Freshness is a query filter, never an
`active` state.

## Live production state — 2026-08-08

- PR #165 is merged/deployed: 0039 + Phase 1b pipeline.
- PR #166 is merged/deployed: 0040 reconciled historical rollups.
- Prod invariants after 0040: 0 ungrouped postings; 0 pending rows; 0 stale
  vacancy/source counters; 0 stale first/last publication rollups; 0 missing
  representative / first-loaded fields.
- `dedup-sweep` Temporal schedule runs every five minutes.
- One duplicate Railway deploy failed because two pre-deploy migrations raced;
  the other deployment succeeded, the migration ledger is correct (41 rows),
  and the live healthcheck is green. Do not repair the ledger manually.

## Current PR

PR #167, `feat/deferred-position-fks`, is green but still draft:

- generated custom migration 0041 makes the cyclic vacancy/group FKs
  `DEFERRABLE INITIALLY DEFERRED`;
- loader preallocates vacancy + singleton-group UUIDs and inserts both in its
  existing transaction;
- integration tests are green: 16 suites / 107 tests.

Merge/deploy #167, then verify one real production ingest that creates or
updates a posting. Query production through:

```bash
prod_db_url="$(scripts/prod-db-url.sh)"
psql "$prod_db_url" -X -P pager=off -c '
  SELECT count(*) FILTER (WHERE unique_vacancy_id IS NULL) AS ungrouped,
         count(*) FILTER (WHERE deduplicated_at IS NULL) AS pending
  FROM vacancies;'
```

Also verify the new posting has a group at insert time, and that the next
dedup sweep stamps `deduplicated_at`. Do not force an RSS ingest or a dedup
reset without explicit owner approval: each can create external cost/data
churn.

## Phase 1c.1 — only after that observed ingest

The original one-step `NOT NULL` plan was incomplete because vacancy and group
form a creation cycle. The safe order is now:

1. 1c.0 = PR #167 (deferred FKs + atomic UUID pair).
2. Observe real production ingest + dedup cycle.
3. 1c.1 = a separate migration/deploy:
   - `ALTER TABLE vacancies ALTER COLUMN unique_vacancy_id SET NOT NULL`;
   - change its FK delete action from `SET NULL` to `RESTRICT`/`NO ACTION`;
   - update schema `.notNull()` and test fixtures that insert raw vacancies.

Before merging 1c.1, test a new insert, content-change replay, merge, reset,
and the reconciliation query. Never put 1c.1 in the same deployment as 1c.0.

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

## Data lab / metalab

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
