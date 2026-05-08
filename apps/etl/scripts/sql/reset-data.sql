-- reset-data.sql
--
-- Nuke bronze + silver + non-verified taxonomy. Keep:
--   * sources                       (config — DOU, Djinni, …)
--   * nodes WHERE status='VERIFIED' (curated taxonomy)
--   * node_aliases for those nodes  (FK cascade keeps them with the parent)
--   * drizzle migrations metadata   (untouched — schema stays migrated)
--
-- After running:
--   * rss_ingests / rss_records / vacancies / vacancy_nodes / companies /
--     company_identifiers are empty
--   * nodes contain only the curated VERIFIED set
--   * /rss treats every RSS item as "new" (hash dedup table empty)
--
-- Does NOT clean up:
--   * MinIO XML payloads — `payload_storage_key`s are gone but the bucket
--     objects accumulate. Drop manually if it bothers you.
--   * Temporal workflow history — old `vacancy-pipeline-{recordId}` runs
--     stay in Temporal's view; harmless because the records are gone.
--
-- ── Run ───────────────────────────────────────────────────────────
--   psql "$DATABASE_URL" -f apps/etl/scripts/sql/reset-data.sql
--
-- Wrapped in a transaction. Ctrl+C before COMMIT aborts cleanly.
-- After COMMIT it is irreversible — re-trigger ingestion via:
--   curl http://localhost:3000/rss

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

\echo '── before ──────────────────────────────────────────────────'
SELECT
  (SELECT count(*) FROM rss_ingests)                     AS ingests,
  (SELECT count(*) FROM rss_records)                     AS records,
  (SELECT count(*) FROM vacancies)                       AS vacancies,
  (SELECT count(*) FROM vacancy_nodes)                   AS vacancy_nodes,
  (SELECT count(*) FROM companies)                       AS companies,
  (SELECT count(*) FROM company_identifiers)             AS company_idents,
  (SELECT count(*) FROM nodes)                           AS nodes_total,
  (SELECT count(*) FROM nodes WHERE status='VERIFIED')   AS nodes_verified,
  (SELECT count(*) FROM node_aliases)                    AS aliases,
  (SELECT count(*) FROM sources)                         AS sources;

-- 1. Wipe bronze + silver. CASCADE guards against any FK we forgot — the
--    only inbound cascades are within this list, so nothing external is
--    pulled in.
TRUNCATE
  vacancy_nodes,
  vacancies,
  rss_records,
  rss_ingests,
  company_identifiers,
  companies
RESTART IDENTITY CASCADE;

-- 2. Drop non-verified taxonomy. node_aliases cascade-deletes by FK.
--    Safe now because vacancies (which referenced role_node_id /
--    domain_node_id without cascade) was just truncated.
DELETE FROM nodes WHERE status <> 'VERIFIED';

\echo '── after ───────────────────────────────────────────────────'
SELECT
  (SELECT count(*) FROM rss_ingests)                     AS ingests,
  (SELECT count(*) FROM rss_records)                     AS records,
  (SELECT count(*) FROM vacancies)                       AS vacancies,
  (SELECT count(*) FROM vacancy_nodes)                   AS vacancy_nodes,
  (SELECT count(*) FROM companies)                       AS companies,
  (SELECT count(*) FROM company_identifiers)             AS company_idents,
  (SELECT count(*) FROM nodes)                           AS nodes_total,
  (SELECT count(*) FROM nodes WHERE status='VERIFIED')   AS nodes_verified,
  (SELECT count(*) FROM node_aliases)                    AS aliases,
  (SELECT count(*) FROM sources)                         AS sources;

\echo
\echo 'Re-trigger ingestion:'
\echo '  curl http://localhost:3000/rss'

COMMIT;
