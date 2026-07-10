import { sql } from "drizzle-orm";
import { uuid, integer, doublePrecision, pgMaterializedView } from "drizzle-orm/pg-core";

// Skill<->skill co-occurrence over per-vacancy skill-sets, with NPMI in [-1,1].
// See md/journal/migrations/skill-metadata-recommendations.md (Migration 2).
//
// Used by the recommendation substitute-gate ONLY: it tells apart a competing
// framework (React/Angular, low npmi → substitute, drop) from a complementary
// one (Selenium/Appium, high npmi → keep) — the one call category metadata
// cannot make. Restricted to nodes with corpus df>=3 (signal + tractability),
// pairs with cooc>=3. npmi = pmi / -ln P(a,b); pmi = ln(P(a,b)/(P(a)P(b))).
//
// Plain (non-CONCURRENT) REFRESH alongside node_stats — read by a join on a_id;
// no unique index required. Index node_skill_cooc_a(a_id) added in the migration.
export const nodeSkillCooc = pgMaterializedView("node_skill_cooc", {
  aId: uuid("a_id"),
  bId: uuid("b_id"),
  cooc: integer("cooc"),
  npmi: doublePrecision("npmi"),
}).as(
  sql`
    WITH df AS (
      SELECT vn.node_id, count(DISTINCT vn.vacancy_id) AS df
      FROM vacancy_nodes vn
      JOIN nodes n ON n.id = vn.node_id AND n.status <> 'HIDDEN' AND n.type = 'SKILL'
      GROUP BY vn.node_id
      HAVING count(DISTINCT vn.vacancy_id) >= 3
    ),
    vs AS (
      SELECT DISTINCT vn.vacancy_id, vn.node_id
      FROM vacancy_nodes vn JOIN df USING (node_id)
    ),
    pairs AS (
      SELECT a.node_id AS a_id, b.node_id AS b_id, count(*)::int AS cooc
      FROM vs a JOIN vs b ON a.vacancy_id = b.vacancy_id AND a.node_id <> b.node_id
      GROUP BY a.node_id, b.node_id
      HAVING count(*) >= 3
    ),
    n AS (SELECT count(*)::float8 AS t FROM vacancies)
    SELECT p.a_id, p.b_id, p.cooc,
           ln((p.cooc / (SELECT t FROM n))
              / ((da.df / (SELECT t FROM n)) * (db.df / (SELECT t FROM n))))
             / (-ln(p.cooc / (SELECT t FROM n))) AS npmi
    FROM pairs p
    JOIN df da ON da.node_id = p.a_id
    JOIN df db ON db.node_id = p.b_id
  `,
);
