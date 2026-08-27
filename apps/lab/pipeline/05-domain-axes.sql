-- Experiment 005 — domain / role / work-format cross-axes, and a first pass
-- at a per-track worthiness profile (MET-143)
--
-- Cut after review, 2026-08-09: a "seniority x skill, conditioned on role"
-- section lived here (and fed the UI as a diverging chart). Dropped — no
-- significance test on ~20-position seniority buckets (a proportion at n=20
-- has ~+/-20pp standard error, and the section reported raw gaps with no
-- interval), and it didn't feed the track-worthiness goal this file exists
-- for. `seniority` stays on metalab_position_axes/metalab_track_profile
-- (cheap, still useful as a track's "top seniority" descriptor) — only the
-- dedicated cross-tab was removed.
--
-- Sandbox stage: run by hand (like 02b/03b), NOT wired into build.sh and NOT
-- feeding graph.json. Everything here reads `positions`/`position_nodes`
-- directly (the migration-0044 read model), unlike 02-04 which predate it and
-- hand-roll the same grain from unique_vacancies/vacancy_nodes. Verified
-- 2026-08-09: positions.position_id = unique_vacancies.id, 1:1, 8876/8876 —
-- so this table's position_id joins cleanly against metalab_position_skill.
--
-- Salary is out of scope on purpose (data-quality concerns, tracked
-- separately). Company x skill cluster is deferred — companies need their own
-- support floor (most post 1-2 vacancies) and isn't built here.

DROP TABLE IF EXISTS metalab_position_axes;
CREATE TABLE metalab_position_axes AS
SELECT p.position_id,
       p.role_node_id,
       r.canonical_name  AS role_name,
       p.domain_node_id,
       d.canonical_name  AS domain_name,
       p.seniority::text AS seniority,
       p.work_format::text AS work_format
FROM positions p
LEFT JOIN nodes r ON r.id = p.role_node_id
LEFT JOIN nodes d ON d.id = p.domain_node_id;
ALTER TABLE metalab_position_axes ADD PRIMARY KEY (position_id);
CREATE INDEX metalab_pa_domain_idx ON metalab_position_axes (domain_node_id);
CREATE INDEX metalab_pa_role_idx   ON metalab_position_axes (role_node_id);

\echo '=== 0. Axis fill rate — is the domain axis usable at all ==='
SELECT count(*) AS positions,
       count(domain_node_id) AS has_domain,
       round(100.0 * count(domain_node_id) / count(*), 1) AS pct_domain,
       count(role_node_id) AS has_role,
       count(seniority) AS has_seniority,
       count(work_format) AS has_work_format
FROM metalab_position_axes;

-- ============================================================
-- 1. Domain x Role — position counts, role mix per domain
-- ============================================================

DROP TABLE IF EXISTS metalab_domain_role;
CREATE TABLE metalab_domain_role AS
SELECT domain_node_id, domain_name, role_node_id, role_name,
       count(*)::bigint AS positions
FROM metalab_position_axes
WHERE domain_node_id IS NOT NULL AND role_node_id IS NOT NULL
GROUP BY domain_node_id, domain_name, role_node_id, role_name;

\echo '=== 1. Domain size and top role inside each domain (>= 25 positions) ==='
WITH domain_n AS (
  SELECT domain_node_id, domain_name, sum(positions) AS n
  FROM metalab_domain_role GROUP BY domain_node_id, domain_name
  HAVING sum(positions) >= 25
),
ranked AS (
  SELECT dr.*, row_number() OVER (PARTITION BY dr.domain_node_id ORDER BY dr.positions DESC) AS rk
  FROM metalab_domain_role dr
  JOIN domain_n dn ON dn.domain_node_id = dr.domain_node_id
)
SELECT domain_name, (SELECT n FROM domain_n WHERE domain_n.domain_node_id = ranked.domain_node_id) AS domain_positions,
       role_name AS top_role, positions AS top_role_positions
FROM ranked WHERE rk = 1 ORDER BY domain_positions DESC;

-- ============================================================
-- 2. Domain x Skill — required-only, same floor as the skill graph (25/10)
-- ============================================================

DROP TABLE IF EXISTS metalab_domain_skill;
CREATE TABLE metalab_domain_skill AS
SELECT a.domain_node_id, a.domain_name, ps.node_id, s.canonical_name AS skill_name,
       count(*)::bigint AS support
FROM metalab_position_axes a
JOIN metalab_position_skill ps ON ps.rule = 'rep' AND ps.position_id = a.position_id
JOIN metalab_skill sk ON sk.rule = 'rep' AND sk.node_id = ps.node_id AND sk.support >= 25
JOIN nodes s ON s.id = ps.node_id
WHERE a.domain_node_id IS NOT NULL
GROUP BY a.domain_node_id, a.domain_name, ps.node_id, s.canonical_name
HAVING count(*) >= 10;

\echo '=== 2. Domain-defining skills — highest share of the domain (>= 25 domain positions) ==='
WITH domain_n AS (
  SELECT domain_node_id, count(DISTINCT position_id) AS n
  FROM metalab_position_axes WHERE domain_node_id IS NOT NULL
  GROUP BY domain_node_id HAVING count(DISTINCT position_id) >= 25
),
ranked AS (
  SELECT ds.domain_name, ds.skill_name, ds.support, dn.n,
         round(100.0 * ds.support / dn.n, 0) AS pct,
         row_number() OVER (PARTITION BY ds.domain_node_id ORDER BY ds.support DESC) AS rk
  FROM metalab_domain_skill ds JOIN domain_n dn ON dn.domain_node_id = ds.domain_node_id
)
SELECT domain_name, n AS domain_positions, skill_name, support, pct
FROM ranked WHERE rk <= 5 ORDER BY domain_name, rk;

-- ============================================================
-- 3. Work format x Domain, Work format x Role
-- ============================================================

\echo '=== 3a. Work format mix per domain (>= 25 domain positions) ==='
WITH domain_n AS (
  SELECT domain_node_id, domain_name, count(*) AS n
  FROM metalab_position_axes WHERE domain_node_id IS NOT NULL
  GROUP BY domain_node_id, domain_name HAVING count(*) >= 25
)
SELECT a.domain_name, dn.n AS domain_positions, a.work_format,
       count(*) AS positions, round(100.0 * count(*) / dn.n, 0) AS pct
FROM metalab_position_axes a
JOIN domain_n dn ON dn.domain_node_id = a.domain_node_id
WHERE a.work_format IS NOT NULL
GROUP BY a.domain_name, dn.n, a.work_format
ORDER BY a.domain_name, positions DESC;

\echo '=== 3b. Work format mix per role (>= 300 role positions) ==='
WITH role_n AS (
  SELECT role_node_id, role_name, count(*) AS n
  FROM metalab_position_axes WHERE role_node_id IS NOT NULL
  GROUP BY role_node_id, role_name HAVING count(*) >= 300
)
SELECT a.role_name, rn.n AS role_positions, a.work_format,
       count(*) AS positions, round(100.0 * count(*) / rn.n, 0) AS pct
FROM metalab_position_axes a
JOIN role_n rn ON rn.role_node_id = a.role_node_id
WHERE a.work_format IS NOT NULL
GROUP BY a.role_name, rn.n, a.work_format
ORDER BY a.role_name, positions DESC;

-- ============================================================
-- 4. Track profile — foundation for the worthiness rubric (support done here;
-- distinctiveness/overlap are a follow-up once this shape is reviewed).
-- Mirrors track_counts' own override-else-inherit ROLE/SKILL resolution
-- (libs/database/src/schema/tracks.ts) so a track's profile here lines up
-- with what the product actually counts and shows on click.
-- ============================================================

DROP TABLE IF EXISTS metalab_track_profile;
CREATE TABLE metalab_track_profile AS
WITH own AS (
  SELECT tn.track_id,
         array_agg(tn.node_id) FILTER (WHERE n.type = 'ROLE')  AS role_ids,
         array_agg(tn.node_id) FILTER (WHERE n.type = 'SKILL') AS skill_ids
  FROM track_nodes tn JOIN nodes n ON n.id = tn.node_id
  GROUP BY tn.track_id
),
eff AS (
  SELECT t.id AS track_id, t.slug, t.label, t.parent_id,
         COALESCE(o.role_ids,  po.role_ids)  AS role_ids,
         COALESCE(o.skill_ids, po.skill_ids) AS skill_ids
  FROM tracks t
  LEFT JOIN own o  ON o.track_id  = t.id
  LEFT JOIN own po ON po.track_id = t.parent_id
),
matched AS (
  -- AND, not OR: a track with both a role preset and a skill preset (e.g.
  -- backend-go = Backend Developer AND Go) must match both. Getting this
  -- wrong is the exact MET-141 bug in the other direction — first draft here
  -- used OR and inflated backend-go to 1497 (bigger than plain "backend" at
  -- 1360), which is how the mistake was caught.
  SELECT e.track_id, e.slug, e.label, a.position_id, a.domain_node_id, a.domain_name, a.seniority, a.work_format
  FROM eff e
  JOIN positions p ON
    (e.role_ids IS NULL OR p.role_node_id = ANY(e.role_ids))
    AND (e.skill_ids IS NULL OR EXISTS (
          SELECT 1 FROM position_nodes pn
          WHERE pn.position_id = p.position_id AND pn.node_id = ANY(e.skill_ids) AND pn.is_required))
  JOIN metalab_position_axes a ON a.position_id = p.position_id
  WHERE (e.role_ids IS NOT NULL OR e.skill_ids IS NOT NULL)
    AND p.role_node_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM nodes rn WHERE rn.id = p.role_node_id AND rn.status = 'VERIFIED')
)
SELECT track_id, slug, label,
       count(*)::bigint AS support,
       mode() WITHIN GROUP (ORDER BY domain_name) AS top_domain,
       mode() WITHIN GROUP (ORDER BY seniority)   AS top_seniority,
       mode() WITHIN GROUP (ORDER BY work_format)  AS top_work_format
FROM matched
GROUP BY track_id, slug, label;

\echo '=== 4. Track support, below/above the skill-graph floor (25) ==='
SELECT slug, label, support,
       CASE WHEN support >= 25 THEN 'ok' ELSE 'below floor — read with caution' END AS floor_check,
       top_domain, top_seniority, top_work_format
FROM metalab_track_profile ORDER BY support DESC;
