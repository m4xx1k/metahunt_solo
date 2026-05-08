-- replay-rss-records.sql
--
-- Wipe silver-layer state for a chosen subset of rss_records so they
-- re-flow through the existing extract + load endpoints. Useful for
-- forcing the pipeline to fire when the RSS feed has nothing new
-- (hash dedup short-circuits ingestAll), or for re-running a single
-- record after an extractor / loader fix.
--
-- ─── Workflow ─────────────────────────────────────────────────────
--   1. Edit the SCOPE block below: uncomment ONE of A/B/C and fill the
--      uuid / code / limit. Leave everything else commented.
--   2. Run the script.
--   3. Curl the existing endpoints to refill silver:
--        curl -X POST 'http://localhost:3000/rss/extract-missing?limit=N'
--        curl -X POST 'http://localhost:3000/loader/backfill?limit=N'
--      (both are idempotent + bounded; pick N ≥ targets.)
--
-- ─── Run ──────────────────────────────────────────────────────────
--   psql "$DATABASE_URL" -f apps/etl/scripts/sql/replay-rss-records.sql
--
-- The script disables psql's pager — without that, quitting `less` mid-
-- run sends SIGPIPE and rolls the whole transaction back silently.
--
-- ─── Safety notes ─────────────────────────────────────────────────
--   * Wrapped in a single transaction. Aborting before COMMIT undoes
--     everything. After COMMIT it is irreversible — but idempotent re-fill
--     restores the same silver rows from the same bronze (modulo extractor
--     non-determinism + new NEW-status nodes if taxonomy moved).
--   * DELETE FROM vacancies cascades to vacancy_nodes (FK onDelete: cascade)
--     — no need to DELETE vacancy_nodes explicitly.
--   * Companies + nodes are NOT touched. Resolvers are upsert-by-key, so
--     re-running the loader will re-link to the same companies / nodes.
--     Orphan companies / NEW nodes that nothing else references survive —
--     drop them via taxonomy moderation if it bothers you.
--   * Running this on prod consumes BAML tokens at re-extract time. The
--     bounded /loader/backfill?limit= caps to 500; run repeatedly for
--     bigger sets, or use POST /loader/backfill/all once extract is done.

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

CREATE TEMP TABLE _replay_targets ON COMMIT DROP AS
SELECT id, source_id, external_id FROM rss_records
WHERE
  -- ── SCOPE A · single record by id ──────────────────────────────
  -- id = '00000000-0000-0000-0000-000000000000'

  -- ── SCOPE B · all records of one ingest ────────────────────────
  -- rss_ingest_id = '00000000-0000-0000-0000-000000000000'

  -- ── SCOPE C · last N records of one source ─────────────────────
  -- source_id = (SELECT id FROM sources WHERE code = 'dou')
  --   AND id IN (
  --     SELECT id FROM rss_records
  --     WHERE source_id = (SELECT id FROM sources WHERE code = 'dou')
  --     ORDER BY created_at DESC LIMIT 5
  --   )

  FALSE  -- ← uncomment ONE of A / B / C above before running
;

\echo '── targets ─────────────────────────────────────────────────'
SELECT count(*) AS targeted FROM _replay_targets;

-- 1. Drop matching silver vacancies (cascades to vacancy_nodes via FK).
WITH deleted AS (
  DELETE FROM vacancies v USING _replay_targets t
  WHERE v.source_id = t.source_id AND v.external_id = t.external_id
  RETURNING v.id
)
SELECT count(*) AS vacancies_deleted FROM deleted \gset

-- 2. Reset extraction state on the bronze records so /rss/extract-missing
--    re-extracts them, and so /loader/backfill picks them up afterwards.
WITH reset AS (
  UPDATE rss_records r SET extracted_at = NULL, extracted_data = NULL
  FROM _replay_targets t WHERE r.id = t.id
  RETURNING r.id
)
SELECT count(*) AS records_reset FROM reset \gset

\echo '── result ──────────────────────────────────────────────────'
SELECT
  (SELECT count(*) FROM _replay_targets) AS targeted,
  :vacancies_deleted                     AS vacancies_deleted,
  :records_reset                         AS records_reset;

\echo
\echo 'Now refill silver — both calls are idempotent:'
\echo '  curl -X POST http://localhost:3000/rss/extract-missing?limit=100'
\echo '  curl -X POST http://localhost:3000/loader/backfill?limit=500'

COMMIT;
