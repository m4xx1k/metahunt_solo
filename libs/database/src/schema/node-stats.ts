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
//   weight = sqrt(ln(N / (df + K))), N = total vacancies (compressed smoothed IDF)
// Generic skills (high df) land near 0 and self-cancel; rare skills approach
// sqrt(ln(N)) — the bull's-eye matches the matcher sorts on. NEW + VERIFIED both
// count: the long tail (most distinct skills are NEW) is exactly where IDF
// differentiates. Only HIDDEN skills are excluded — the one "do not surface"
// signal, mirrored from the feed.
//
// K is the fat-tail smoothing constant (tracker, "The fat tail"). Without it a
// single df=1 skill (typo / extractor hallucination / hyper-niche lib like
// passport.js) scores ln(N) ≈ 8.8 and catapults an otherwise-weak vacancy to
// the top. K=5 settles df=1 from ~8.8 → ~7.0 and eases the whole tail down with
// no discontinuity, so a broad confident match out-ranks one lottery hit.
//
// The outer sqrt COMPRESSES the dynamic range. Raw IDF spans ~0.5 (git) to ~7
// (rare), a 12× spread, so ONE high-IDF skill outweighs a dozen ordinary ones.
// The failure mode: a skill that is expected but rarely written in JDs (e.g.
// jest for senior backend) gets a low df → falsely high IDF → over-boosts every
// vacancy that happens to spell it out. sqrt pulls the heavy tail down (7 → 2.6)
// while barely touching the light end (0.5 → 0.71), shrinking the spread to
// ~3.4× — heavy skills still win, but no single one dominates. Ordering is
// preserved (sqrt is monotonic), so it's a pure range compression. K and sqrt
// are the tuning points — change here, regenerate the migration, refresh.
//
// Materialized so the matcher is a plain join + SUM. Refreshed CONCURRENTLY as
// the final step of ingest (the UNIQUE index on node_id, added in the
// migration, is what CONCURRENTLY requires).
export const nodeStats = pgMaterializedView('node_stats', {
  nodeId: uuid('node_id'),
  df: integer('df'),
  weight: doublePrecision('weight'),
}).as(
  sql`
    SELECT vn.node_id,
           count(DISTINCT vn.vacancy_id)::int AS df,
           sqrt(ln((SELECT count(*) FROM vacancies)::float8
              / (count(DISTINCT vn.vacancy_id) + 5))) AS weight
    FROM vacancy_nodes vn
    JOIN nodes n ON n.id = vn.node_id
    WHERE n.status <> 'HIDDEN'
    GROUP BY vn.node_id
  `,
);
