import {
  uuid,
  integer,
  doublePrecision,
  pgMaterializedView,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// IDF skill weights for the reverse-ATS matcher. See
// md/journal/migrations/reverse-ats.md (Engine v1 — "Why IDF").
//
// One row per skill node carried by at least one vacancy:
//   df     = how many vacancies carry the skill (document frequency)
//   weight = ln(N / df), N = total vacancies (inverse document frequency)
// Generic skills (high df) land near 0 and self-cancel; rare skills approach
// ln(N) — the bull's-eye matches the matcher sorts on. NEW + VERIFIED both
// count: the long tail (most distinct skills are NEW) is exactly where IDF
// differentiates. Only HIDDEN skills are excluded — the one "do not surface"
// signal, mirrored from the feed.
//
// Materialized so the matcher is a plain join + SUM. Refreshed CONCURRENTLY as
// the final step of ingest (the UNIQUE index on node_id, added in the
// migration, is what CONCURRENTLY requires). The `weight` expression is the
// SINGLE tuning point: if the df=1 tail ever fizzes, swap `ln(N/df)` for the
// smoothed `ln(N/(df+k))` here — no other code changes (tracker, "The fat tail").
export const nodeStats = pgMaterializedView('node_stats', {
  nodeId: uuid('node_id'),
  df: integer('df'),
  weight: doublePrecision('weight'),
}).as(
  sql`
    SELECT vn.node_id,
           count(DISTINCT vn.vacancy_id)::int AS df,
           ln((SELECT count(*) FROM vacancies)::float8
              / count(DISTINCT vn.vacancy_id)) AS weight
    FROM vacancy_nodes vn
    JOIN nodes n ON n.id = vn.node_id
    WHERE n.status <> 'HIDDEN'
    GROUP BY vn.node_id
  `,
);
