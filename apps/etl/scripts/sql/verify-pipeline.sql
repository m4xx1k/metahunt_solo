-- verify-pipeline.sql
--
-- Read-only snapshot of pipeline health. Run after triggering /rss to
-- confirm bronze → silver chain worked end-to-end.
--
-- Run:
--   psql "$DATABASE_URL" -f apps/etl/scripts/sql/verify-pipeline.sql
--
-- Sections:
--   1. headline counts — ingests / records / extracted / vacancies / pending
--   2. latest ingest per source — status, duration, record / extracted counts
--   3. health flags — anything stuck (extracted-not-loaded, parsed-not-extracted)
--   4. failed ingests in the last hour — error_message tail
--   5. taxonomy delta — NEW-status nodes auto-created by this run
--   6. sample of latest vacancies — title / role / seniority / source

\set ON_ERROR_STOP on
\pset pager off

\echo ''
\echo '═══ 1. headline counts ═════════════════════════════════════'
SELECT
  (SELECT count(*) FROM rss_ingests)                                 AS ingests,
  (SELECT count(*) FROM rss_ingests WHERE status='completed')        AS ing_ok,
  (SELECT count(*) FROM rss_ingests WHERE status='failed')           AS ing_fail,
  (SELECT count(*) FROM rss_ingests WHERE status='running')          AS ing_run,
  (SELECT count(*) FROM rss_records)                                 AS records,
  (SELECT count(*) FROM rss_records WHERE extracted_at IS NOT NULL)  AS extracted,
  (SELECT count(*) FROM vacancies)                                   AS vacancies,
  (SELECT count(*) FROM rss_records r WHERE r.extracted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM vacancies v
                     WHERE v.source_id=r.source_id AND v.external_id=r.external_id)) AS pending_loader,
  (SELECT count(*) FROM companies)                                   AS companies,
  (SELECT count(*) FROM nodes)                                       AS nodes_total,
  (SELECT count(*) FROM nodes WHERE status='VERIFIED')               AS nodes_verified,
  (SELECT count(*) FROM nodes WHERE status='NEW')                    AS nodes_new;

\echo ''
\echo '═══ 2. latest ingest per source ════════════════════════════'
SELECT
  s.code                                                                            AS source,
  i.status                                                                          AS status,
  to_char(i.started_at, 'HH24:MI:SS')                                               AS started,
  CASE WHEN i.finished_at IS NULL THEN NULL
       ELSE (EXTRACT(EPOCH FROM (i.finished_at - i.started_at)) * 1000)::int END    AS dur_ms,
  c.records,
  c.extracted,
  CASE
    WHEN c.records = 0                THEN 'no new items (hash dedup)'
    WHEN c.extracted = c.records      THEN 'fully extracted'
    WHEN c.extracted = 0              THEN 'EXTRACTION STUCK'
    ELSE 'partial: ' || c.extracted || '/' || c.records
  END                                                                               AS note
FROM rss_ingests i
JOIN sources s ON s.id = i.source_id
JOIN LATERAL (
  SELECT
    count(*)::int                                          AS records,
    count(*) FILTER (WHERE r.extracted_at IS NOT NULL)::int AS extracted
  FROM rss_records r WHERE r.rss_ingest_id = i.id
) c ON TRUE
WHERE i.id IN (
  SELECT DISTINCT ON (source_id) id FROM rss_ingests
  ORDER BY source_id, started_at DESC
)
ORDER BY s.code;

\echo ''
\echo '═══ 3. health flags ════════════════════════════════════════'
SELECT
  'extracted-not-loaded'                                                                      AS flag,
  (SELECT count(*) FROM rss_records r WHERE r.extracted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM vacancies v
                     WHERE v.source_id=r.source_id AND v.external_id=r.external_id))          AS count,
  'POST /loader/backfill?limit=500 to recover'                                                AS hint
UNION ALL
SELECT
  'parsed-not-extracted',
  (SELECT count(*) FROM rss_records WHERE extracted_at IS NULL),
  'POST /rss/extract-missing?limit=500 to recover (BAML tokens)'
UNION ALL
SELECT
  'companies-no-vacancies',
  (SELECT count(*) FROM companies c
     WHERE NOT EXISTS (SELECT 1 FROM vacancies v WHERE v.company_id=c.id)),
  'orphan companies — usually fine, just leftover from reset'
UNION ALL
SELECT
  'NEW-nodes-no-usage',
  (SELECT count(*) FROM nodes n WHERE n.status='NEW'
     AND NOT EXISTS (SELECT 1 FROM vacancy_nodes vn WHERE vn.node_id=n.id)
     AND NOT EXISTS (SELECT 1 FROM vacancies v WHERE v.role_node_id=n.id OR v.domain_node_id=n.id)),
  'orphan NEW nodes — fine, just unused';

\echo ''
\echo '═══ 4. failed ingests in last hour ═════════════════════════'
SELECT
  s.code                                  AS source,
  to_char(i.started_at, 'HH24:MI:SS')     AS started,
  left(coalesce(i.error_message, ''), 120) AS error
FROM rss_ingests i
JOIN sources s ON s.id = i.source_id
WHERE i.status = 'failed' AND i.started_at > now() - interval '1 hour'
ORDER BY i.started_at DESC
LIMIT 10;

\echo ''
\echo '═══ 5. taxonomy delta — NEW nodes (top 20 by usage) ════════'
SELECT
  n.type                                  AS type,
  left(n.canonical_name, 50)              AS name,
  CASE n.type
    WHEN 'SKILL'  THEN (SELECT count(*)::int FROM vacancy_nodes vn WHERE vn.node_id = n.id)
    WHEN 'ROLE'   THEN (SELECT count(*)::int FROM vacancies v      WHERE v.role_node_id   = n.id)
    WHEN 'DOMAIN' THEN (SELECT count(*)::int FROM vacancies v      WHERE v.domain_node_id = n.id)
  END                                     AS used,
  to_char(n.created_at, 'HH24:MI:SS')     AS created
FROM nodes n
WHERE n.status = 'NEW'
ORDER BY used DESC NULLS LAST, n.created_at DESC
LIMIT 20;

\echo ''
\echo '═══ 6. latest 10 vacancies ═════════════════════════════════'
SELECT
  to_char(v.loaded_at, 'HH24:MI:SS')         AS loaded,
  s.code                                     AS src,
  coalesce(v.seniority::text, '?')           AS sen,
  coalesce(rn.canonical_name, '— roleless —') AS role,
  coalesce(c.name, '— no company —')         AS company,
  left(v.title, 50)                          AS title
FROM vacancies v
LEFT JOIN sources   s  ON s.id  = v.source_id
LEFT JOIN nodes     rn ON rn.id = v.role_node_id
LEFT JOIN companies c  ON c.id  = v.company_id
ORDER BY v.loaded_at DESC
LIMIT 10;

\echo ''
\echo 'Quick read:'
\echo '  • section 1: extracted should ≈ records, vacancies should ≈ extracted'
\echo '  • section 1: pending_loader = 0 means the loader fan-out caught everything'
\echo '  • section 3: ideally all zero (or only the orphan-NEW kind)'
\echo '  • section 4: should be empty if pipeline is healthy'
