-- Experiment 006 — emit the domain-axes sandbox artifact (MET-143)
--
-- Depends on the tables built by 05-domain-axes.sql (run that first). Unlike
-- 04-export.sql this is NOT part of build.sh — it feeds a separate artifact
-- that the UI marks as unreviewed, not src/data/graph.json.
--
-- Cut after review, 2026-08-09: seniority-x-skill-in-role and the two
-- work-format breakdowns didn't earn a UI section (see 05-domain-axes.sql
-- and src/views/Experiments.tsx for why) — this export only carries what the
-- UI actually renders. The underlying tables/echoes for work format still
-- exist in 05 for ad-hoc `psql.sh` exploration; they're just not exported.
--
-- Run:  pipeline/psql.sh -f pipeline/05-domain-axes.sql          (builds tables)
--       pipeline/psql.sh -tAf pipeline/06-export-domain-axes.sql \
--         > src/data/experiments/domain-axes.json

WITH params AS (
  SELECT 25::int AS min_domain_positions, 10::int AS min_domain_skill_support,
         25::int AS min_track_support
),
domain_n AS (
  SELECT domain_node_id, domain_name, count(*) AS n
  FROM metalab_position_axes WHERE domain_node_id IS NOT NULL
  GROUP BY domain_node_id, domain_name
  HAVING count(*) >= (SELECT min_domain_positions FROM params)
),
domain_role_ranked AS (
  SELECT dr.*, dn.n AS domain_positions,
         row_number() OVER (PARTITION BY dr.domain_node_id ORDER BY dr.positions DESC) AS rk
  FROM metalab_domain_role dr JOIN domain_n dn ON dn.domain_node_id = dr.domain_node_id
),
domain_role_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'domain', domain_name, 'domainPositions', domain_positions,
           'role', role_name, 'positions', positions
         ) ORDER BY domain_positions DESC, positions DESC) AS v
  FROM domain_role_ranked WHERE rk <= 5
),
domain_skill_ranked AS (
  SELECT ds.*, dn.n AS domain_positions,
         round(100.0 * ds.support / dn.n, 0) AS pct,
         row_number() OVER (PARTITION BY ds.domain_node_id ORDER BY ds.support DESC) AS rk
  FROM metalab_domain_skill ds JOIN domain_n dn ON dn.domain_node_id = ds.domain_node_id
),
domain_skill_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'domain', domain_name, 'domainPositions', domain_positions,
           'skill', skill_name, 'support', support, 'pct', pct
         ) ORDER BY domain_positions DESC, support DESC) AS v
  FROM domain_skill_ranked WHERE rk <= 5
),
track_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'slug', slug, 'label', label, 'support', support,
           'floorOk', support >= (SELECT min_track_support FROM params),
           'topDomain', top_domain, 'topSeniority', top_seniority, 'topWorkFormat', top_work_format
         ) ORDER BY support DESC) AS v
  FROM metalab_track_profile
)
SELECT jsonb_build_object(
  'contract', jsonb_build_object(
    'status',                'unreviewed sandbox — not part of the v0 graph contract',
    'grain',                 'canonical position (positions.position_id)',
    'skillRequirementLayer', 'REQUIRED only (position_nodes.is_required)',
    'minDomainPositions',    (SELECT min_domain_positions FROM params),
    'minDomainSkillSupport', (SELECT min_domain_skill_support FROM params),
    'minTrackSupport',       (SELECT min_track_support FROM params)
  ),
  'provenance', jsonb_build_object(
    'generatedAt', now(),
    'experiment',  'pipeline/06-export-domain-axes.sql',
    'issue',       'MET-143',
    'positions',   (SELECT count(*) FROM metalab_position_axes),
    'domainFillPct', (SELECT round(100.0 * count(domain_node_id) / count(*), 1) FROM metalab_position_axes)
  ),
  'domainRole',   COALESCE((SELECT v FROM domain_role_rows), '[]'::jsonb),
  'domainSkill',  COALESCE((SELECT v FROM domain_skill_rows), '[]'::jsonb),
  'trackProfile', COALESCE((SELECT v FROM track_rows), '[]'::jsonb)
);
