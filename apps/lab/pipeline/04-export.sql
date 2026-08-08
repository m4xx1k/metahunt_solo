-- Experiment 004 — emit the Metalab v0 graph artifact (MET-129 Phases 6 & 8)
--
-- One JSON document containing the whole exploratory graph plus the provenance
-- needed to reproduce it. The web app reads this file directly: no runtime
-- database dependency, so the research UI cannot drift from the numbers that
-- were actually reviewed, and prod is never queried to render it.
--
-- Run:  pipeline/psql.sh -tAf pipeline/04-export.sql \
--         > src/data/graph.json

WITH params AS (
  SELECT 'rep'::text AS rule, 25::int AS min_skill_support, 10::int AS min_pair_support,
         300::int AS min_role_positions
),
-- Edges reference nodes by their ordinal in the `nodes` array rather than by
-- UUID. Two 36-char ids per edge dominated the artifact; the index costs ~4.
node_idx AS MATERIALIZED (
  SELECT s.node_id, (row_number() OVER (ORDER BY s.support DESC, s.node_id) - 1)::int AS idx
  FROM metalab_skill s CROSS JOIN params p
  WHERE s.rule = p.rule AND s.support >= p.min_skill_support
),
node_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'id',         s.node_id,
           'name',       s.canonical_name,
           'slug',       s.slug,
           'support',    s.support,
           'prevalence', round(s.prevalence::numeric, 5),
           'category',   tm.category,
           'stack',      tm.stack,
           'isCore',     tm.is_core,
           'generic',    tm.generic
         ) ORDER BY s.support DESC, s.node_id) AS v
  FROM metalab_skill s
  LEFT JOIN node_tech_meta tm ON tm.node_id = s.node_id
  CROSS JOIN params p
  WHERE s.rule = p.rule AND s.support >= p.min_skill_support
),
edge_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'a',      ia.idx,
           'b',      ib.idx,
           'pairs',  e.pair_positions,
           'pBgivenA', round(e.p_b_given_a::numeric, 4),
           'pAgivenB', round(e.p_a_given_b::numeric, 4),
           'lift',   round(e.lift::numeric, 3),
           'npmi',   round(e.npmi::numeric, 4)
         ) ORDER BY e.npmi DESC) AS v
  FROM metalab_edge e
  JOIN node_idx ia ON ia.node_id = e.a_id
  JOIN node_idx ib ON ib.node_id = e.b_id
  CROSS JOIN params p
  WHERE e.rule = p.rule AND e.pair_positions >= p.min_pair_support
),
-- Role segments: the confounding control. An edge that only exists globally
-- is composition; one that survives inside its role is an ecosystem link.
role_defs AS MATERIALIZED (
  SELECT m.role_node_id, m.role_name, count(DISTINCT ps.position_id) AS n_positions
  FROM metalab_position_meta m
  JOIN metalab_position_skill ps ON ps.position_id = m.position_id AND ps.rule = 'rep'
  GROUP BY m.role_node_id, m.role_name
  HAVING count(DISTINCT ps.position_id) >= (SELECT min_role_positions FROM params)
),
role_skill AS MATERIALIZED (
  SELECT rd.role_node_id, ps.node_id, count(DISTINCT ps.position_id) AS support
  FROM role_defs rd
  JOIN metalab_position_meta m ON m.role_node_id = rd.role_node_id
  JOIN metalab_position_skill ps ON ps.position_id = m.position_id AND ps.rule = 'rep'
  GROUP BY rd.role_node_id, ps.node_id
),
role_pair AS MATERIALIZED (
  SELECT rd.role_node_id, a.node_id AS a_id, b.node_id AS b_id,
         count(DISTINCT a.position_id) AS pairs
  FROM role_defs rd
  JOIN metalab_position_meta m ON m.role_node_id = rd.role_node_id
  JOIN metalab_position_skill a ON a.position_id = m.position_id AND a.rule = 'rep'
  JOIN metalab_position_skill b ON b.position_id = m.position_id AND b.rule = 'rep'
                                AND b.node_id > a.node_id
  GROUP BY rd.role_node_id, a.node_id, b.node_id
  HAVING count(DISTINCT a.position_id) >= (SELECT min_pair_support FROM params)
),
role_rows AS (
  SELECT jsonb_agg(jsonb_build_object(
           'id',        rd.role_node_id,
           'name',      rd.role_name,
           'positions', rd.n_positions,
           -- Per-role skill demand. Without it a role can only be a filter on
           -- the global graph; with it, "what does this role actually ask for"
           -- is answerable on its own denominator.
           'skills', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'n', i.idx, 'support', rs.support,
                      'share', round((rs.support::numeric / rd.n_positions), 4)
                    ) ORDER BY rs.support DESC), '[]'::jsonb)
             FROM role_skill rs
             JOIN node_idx i ON i.node_id = rs.node_id
             WHERE rs.role_node_id = rd.role_node_id
               AND rs.support >= (SELECT min_pair_support FROM params)
           ),
           'edges', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'a', ia.idx, 'b', ib.idx, 'pairs', rp.pairs,
                      'pBgivenA', round((rp.pairs::numeric / sa.support), 4),
                      'pAgivenB', round((rp.pairs::numeric / sb.support), 4),
                      'lift', round(((rp.pairs::numeric * rd.n_positions)
                                     / (sa.support::numeric * sb.support)), 3)
                    ) ORDER BY rp.pairs DESC), '[]'::jsonb)
             FROM role_pair rp
             JOIN role_skill sa ON sa.role_node_id = rd.role_node_id AND sa.node_id = rp.a_id
             JOIN role_skill sb ON sb.role_node_id = rd.role_node_id AND sb.node_id = rp.b_id
             JOIN node_idx ia ON ia.node_id = rp.a_id
             JOIN node_idx ib ON ib.node_id = rp.b_id
             WHERE rp.role_node_id = rd.role_node_id
           )
         ) ORDER BY rd.n_positions DESC) AS v
  FROM role_defs rd
),
-- Robustness numbers measured in 002b, carried into the UI so the methodology
-- panel states them rather than the reader having to trust a README.
sensitivity AS (
  SELECT jsonb_build_object(
    'unionPositions',  (SELECT n_positions FROM metalab_corpus WHERE rule='union'),
    'unionSkillLinks', (SELECT count(*) FROM metalab_position_skill WHERE rule='union'),
    'repSkillLinks',   (SELECT count(*) FROM metalab_position_skill WHERE rule='rep'),
    'unionOnlyEdges',  (SELECT count(*) FROM metalab_edge u WHERE u.rule='union' AND u.pair_positions >= 10
                          AND NOT EXISTS (SELECT 1 FROM metalab_edge e WHERE e.rule='rep'
                                          AND e.a_id=u.a_id AND e.b_id=u.b_id AND e.pair_positions >= 10)),
    'repOnlyEdges',    (SELECT count(*) FROM metalab_edge e WHERE e.rule='rep' AND e.pair_positions >= 10
                          AND NOT EXISTS (SELECT 1 FROM metalab_edge u WHERE u.rule='union'
                                          AND u.a_id=e.a_id AND u.b_id=e.b_id AND u.pair_positions >= 10))
  ) AS v
),
sources AS (
  SELECT jsonb_agg(jsonb_build_object('code', source_code, 'positions', n) ORDER BY n DESC) AS v
  FROM (SELECT source_code, count(*) AS n FROM metalab_position_meta GROUP BY source_code) q
)
SELECT jsonb_build_object(
  'contract', jsonb_build_object(
    'grain',            'canonical position (unique_vacancies.id)',
    'positionSkillRule','representative member only',
    'skillEligibility', 'nodes.type=SKILL AND nodes.status=VERIFIED',
    'requirementLayer', 'REQUIRED only (vacancy_nodes.is_required)',
    'livenessClaim',    'none',
    'minSkillSupport',  (SELECT min_skill_support FROM params),
    'minPairSupport',   (SELECT min_pair_support FROM params),
    'minRolePositions', (SELECT min_role_positions FROM params)
  ),
  'provenance', jsonb_build_object(
    'snapshot',      'Railway prod pg_dump, 2026-08-07',
    'corpusStart',   (SELECT min(loaded_at)::date FROM vacancies),
    'corpusEnd',     (SELECT max(loaded_at)::date FROM vacancies),
    'postings',      (SELECT count(*) FROM vacancies),
    'positions',     (SELECT count(*) FROM unique_vacancies),
    'nPositions',    (SELECT n_positions FROM metalab_corpus WHERE rule='rep'),
    'generatedAt',   now(),
    'experiment',    'pipeline/04-export.sql',
    'issue',         'MET-129'
  ),
  'sensitivity', (SELECT v FROM sensitivity),
  'sources',     (SELECT v FROM sources),
  'nodes',       (SELECT v FROM node_rows),
  'edges',       (SELECT v FROM edge_rows),
  'roles',       (SELECT v FROM role_rows)
);
