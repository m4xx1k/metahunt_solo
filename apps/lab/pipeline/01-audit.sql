-- Experiment 001 — position-grain audit (MET-129, Phase 1)
--
-- Question: is the corpus sound enough to compute skill co-occurrence at
-- CANONICAL POSITION grain, and what does the eligible universe actually
-- look like once we insist on one-position-one-vote?
--
-- Grain: unique_vacancies.id. Postings (vacancies) are observations of a
-- position and never get their own vote. Every block below prints its own
-- denominator; a number without one is not a finding.

\echo '=== 1. Grain invariants ==='
SELECT
  (SELECT count(*) FROM vacancies)                                    AS postings,
  (SELECT count(*) FROM unique_vacancies)                             AS positions,
  (SELECT count(*) FROM vacancies WHERE unique_vacancy_id IS NULL)    AS ungrouped_postings,
  (SELECT count(*) FROM unique_vacancies uv
     WHERE NOT EXISTS (SELECT 1 FROM vacancies v
                        WHERE v.id = uv.canonical_vacancy_id
                          AND v.unique_vacancy_id = uv.id))           AS canonical_not_a_member,
  (SELECT count(*) FROM unique_vacancies uv
     WHERE uv.vacancy_count <> (SELECT count(*) FROM vacancies v WHERE v.unique_vacancy_id = uv.id))
                                                                      AS stale_vacancy_count;

\echo '=== 2. Member-count distribution (denominator = all positions) ==='
WITH m AS (
  SELECT uv.id, count(v.id) AS members
  FROM unique_vacancies uv
  JOIN vacancies v ON v.unique_vacancy_id = uv.id
  GROUP BY uv.id
)
SELECT members,
       count(*) AS positions,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct_of_positions,
       sum(members * count(*)) OVER (ORDER BY members) AS cum_postings
FROM m GROUP BY members ORDER BY members;

\echo '=== 3. Source composition — postings vs positions (dedup credit) ==='
-- A source that mostly reposts other sources loses weight at position grain.
-- Position is credited to the source of its canonical member.
SELECT s.code,
       count(DISTINCT v.id)                                   AS postings,
       count(DISTINCT uv.id)                                  AS positions_owned,
       round(100.0 * count(DISTINCT uv.id)
             / (SELECT count(*) FROM unique_vacancies), 2)    AS pct_of_positions
FROM sources s
JOIN vacancies v ON v.source_id = s.id
LEFT JOIN unique_vacancies uv ON uv.canonical_vacancy_id = v.id
GROUP BY s.code ORDER BY postings DESC;

\echo '=== 4. Skill-link mass by node status and requirement layer (postings grain, raw links) ==='
SELECT n.status,
       vn.is_required,
       count(*)                                            AS links,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2)  AS pct_of_links,
       count(DISTINCT vn.node_id)                          AS distinct_skills
FROM vacancy_nodes vn
JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL'
GROUP BY n.status, vn.is_required
ORDER BY links DESC;

\echo '=== 5. Position coverage by eligibility rule (denominator = 12,763 positions) ==='
-- How many positions survive each candidate contract? A rule that empties the
-- corpus is not conservative, it is useless.
WITH rep AS (   -- representative-only: skills of the canonical member
  SELECT uv.id AS position_id, vn.node_id, vn.is_required, n.status
  FROM unique_vacancies uv
  JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id
  JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL'
), total AS (SELECT count(*)::numeric AS n FROM unique_vacancies)
SELECT 'any skill, any status'        AS rule, count(DISTINCT position_id) AS positions,
       round(100.0 * count(DISTINCT position_id) / (SELECT n FROM total), 2) AS pct FROM rep
UNION ALL
SELECT 'required, any status', count(DISTINCT position_id),
       round(100.0 * count(DISTINCT position_id) / (SELECT n FROM total), 2) FROM rep WHERE is_required
UNION ALL
SELECT 'required, not HIDDEN', count(DISTINCT position_id),
       round(100.0 * count(DISTINCT position_id) / (SELECT n FROM total), 2) FROM rep WHERE is_required AND status <> 'HIDDEN'
UNION ALL
SELECT 'required, VERIFIED only', count(DISTINCT position_id),
       round(100.0 * count(DISTINCT position_id) / (SELECT n FROM total), 2) FROM rep WHERE is_required AND status = 'VERIFIED'
UNION ALL
SELECT 'required, VERIFIED, >=2 skills', count(*),
       round(100.0 * count(*) / (SELECT n FROM total), 2)
FROM (SELECT position_id FROM rep WHERE is_required AND status = 'VERIFIED'
      GROUP BY position_id HAVING count(*) >= 2) q;

\echo '=== 6. Skills per position, representative-only, required, by status filter ==='
WITH rep AS (
  SELECT uv.id AS position_id, vn.node_id, n.status
  FROM unique_vacancies uv
  JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id AND vn.is_required
  JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL'
), per AS (
  SELECT position_id,
         count(*) FILTER (WHERE status <> 'HIDDEN')  AS not_hidden,
         count(*) FILTER (WHERE status = 'VERIFIED') AS verified
  FROM rep GROUP BY position_id
)
SELECT 'not HIDDEN' AS filter, count(*) AS positions_with_any,
       round(avg(not_hidden), 2) AS mean, percentile_cont(0.5) WITHIN GROUP (ORDER BY not_hidden) AS median,
       max(not_hidden) AS max FROM per WHERE not_hidden > 0
UNION ALL
SELECT 'VERIFIED', count(*), round(avg(verified), 2),
       percentile_cont(0.5) WITHIN GROUP (ORDER BY verified), max(verified) FROM per WHERE verified > 0;

\echo '=== 7. Role and seniority coverage at position grain (representative) ==='
SELECT count(*)                                                    AS positions,
       count(v.role_node_id)                                       AS with_role,
       round(100.0 * count(v.role_node_id) / count(*), 2)          AS pct_role,
       count(v.seniority)                                          AS with_seniority,
       round(100.0 * count(v.seniority) / count(*), 2)             AS pct_seniority
FROM unique_vacancies uv JOIN vacancies v ON v.id = uv.canonical_vacancy_id;

\echo '=== 8. Top roles at position grain (candidate segments for confounding check) ==='
SELECT n.canonical_name AS role, count(*) AS positions,
       round(100.0 * count(*) / (SELECT count(*) FROM unique_vacancies), 2) AS pct
FROM unique_vacancies uv
JOIN vacancies v ON v.id = uv.canonical_vacancy_id
JOIN nodes n ON n.id = v.role_node_id
GROUP BY n.canonical_name ORDER BY positions DESC LIMIT 20;

\echo '=== 9. Corpus time span (loaded_at = observation, the only honest axis) ==='
SELECT date_trunc('week', first_loaded)::date AS week, count(*) AS positions
FROM (SELECT uv.id, min(v.loaded_at) AS first_loaded
      FROM unique_vacancies uv JOIN vacancies v ON v.unique_vacancy_id = uv.id
      GROUP BY uv.id) q
GROUP BY 1 ORDER BY 1;

\echo '=== 10. Support distribution of eligible skills (sets the min-support threshold) ==='
WITH rep AS (
  SELECT DISTINCT uv.id AS position_id, vn.node_id
  FROM unique_vacancies uv
  JOIN vacancy_nodes vn ON vn.vacancy_id = uv.canonical_vacancy_id AND vn.is_required
  JOIN nodes n ON n.id = vn.node_id AND n.type = 'SKILL' AND n.status = 'VERIFIED'
), df AS (SELECT node_id, count(*) AS support FROM rep GROUP BY node_id)
SELECT 'skills total' AS bucket, count(*) AS skills, sum(support) AS link_mass FROM df
UNION ALL SELECT 'support >= 5',   count(*), sum(support) FROM df WHERE support >= 5
UNION ALL SELECT 'support >= 10',  count(*), sum(support) FROM df WHERE support >= 10
UNION ALL SELECT 'support >= 25',  count(*), sum(support) FROM df WHERE support >= 25
UNION ALL SELECT 'support >= 50',  count(*), sum(support) FROM df WHERE support >= 50
UNION ALL SELECT 'support >= 100', count(*), sum(support) FROM df WHERE support >= 100;
