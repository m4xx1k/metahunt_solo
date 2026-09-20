-- Corpus skill coverage: of the canonical postings whose text names a skill
-- unmistakably, how many actually carry the link. Free, label-free, no provider
-- call — the number analytics and scoring actually run on, unlike the golden
-- set's exact-clause score. See md/journal/migrations/requirement-groups-measurements.md.
--
-- Run it against the same database before and after a re-extraction and compare.
-- Jenkins is the indicator for requirement groups: its gap is concentrated in
-- "ci/cd tools (jenkins, github actions, etc.)" — a named example inside a list
-- of alternatives. If Jenkins does not move, grouping did not reach its case.
--
--   psql "$DATABASE_URL" -f scripts/sql/corpus-skill-coverage.sql
--
WITH probe(skill, pattern) AS (
  VALUES
    ('TypeScript',  '\mtypescript\M'),
    ('Playwright',  '\mplaywright\M'),
    ('Terraform',   '\mterraform\M'),
    ('Kubernetes',  '\mkubernetes\M'),
    ('Ansible',     '\mansible\M'),
    ('Docker',      '\mdocker\M'),
    ('PostgreSQL',  '\mpostgresql\M'),
    ('MongoDB',     '\mmongodb\M'),
    ('Django',      '\mdjango\M'),
    ('Kafka',       '\mkafka\M'),
    ('Redis',       '\mredis\M'),
    ('React',       '\mreact\M'),
    ('GraphQL',     '\mgraphql\M'),
    ('Grafana',     '\mgrafana\M'),
    ('Jenkins',     '\mjenkins\M')
),
mentioned AS (
  SELECT pr.skill, p.position_id
  FROM positions p
  JOIN probe pr ON p.description ~* pr.pattern
),
linked AS (
  SELECT pr.skill, p.position_id
  FROM positions p
  JOIN probe pr ON p.description ~* pr.pattern
  JOIN position_nodes pn ON pn.position_id = p.position_id
  JOIN nodes n ON n.id = pn.node_id AND n.type = 'SKILL'
  WHERE lower(n.canonical_name) = lower(pr.skill)
)
SELECT pr.skill,
       (SELECT count(*) FROM mentioned m WHERE m.skill = pr.skill) AS mentioned,
       (SELECT count(*) FROM linked l WHERE l.skill = pr.skill)    AS linked,
       round(100.0 * (SELECT count(*) FROM linked l WHERE l.skill = pr.skill)
             / nullif((SELECT count(*) FROM mentioned m WHERE m.skill = pr.skill), 0), 1) AS coverage
FROM probe pr
ORDER BY coverage DESC;
