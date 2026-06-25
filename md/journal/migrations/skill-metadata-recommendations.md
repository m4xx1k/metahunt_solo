# Skill-metadata recommendations — implementation spec

Status: **planned** (not started). Derived from the research in
[`skill-weighting-research.md`](skill-weighting-research.md) (verdict = approach E).

## Branch plan (decided)
1. **First merge `feat/cv-skill-recommendations` → `main`** via PR (it's a finished feature +
   these docs; the old "entanglement" with `experiment/feed-reverse-ats-merge` is moot — that
   branch is parked junk). Pre-merge: `pnpm build` green + widget sanity-check.
2. **Then branch `feat/recs-skill-metadata` off `main`** and do this work there.
3. **One PR, two logical commits** (NOT two PRs — solo repo, no need for that ceremony):
   commit 1 = data (schema + migrations + classification backfill), commit 2 = logic (service
   gates + contract). **Pause for user review before each commit** (see Phasing).

## Scope — v1 is deliberately minimal

**Ship: categorical gates (C) + co-occurrence substitute gate.** This fixes F1/F2/F3 + the
substitute case and passes all hard gates 5/5 (prod-scale judge ~4.3 vs 2.5). It touches
**only the recommendation path** — ranking and `node_stats`/IDF are untouched.

**Defer (not in v1):** the tiered importance weight (approach E's weight) — it changes ranking
for marginal recommendation gain (only suppresses generic Git/Linux from "learn next"). Higher
risk, lowest value. Revisit as a separate experiment (stack-scoped RCA, see research §8).

Rationale: the failure was never in ranking; it's the recommendation cohort mixing stacks. The
gates are pure `AND NOT (...)` subtractions — where skill metadata is absent (`stack=null`,
e.g. embedded/hardware) they are **safe no-ops** and degrade to today's behaviour, never worse.

## What changes (overview)

1. **New additive table** `node_tech_meta(node_id, category, stack, is_core, generic)`.
2. **New additive materialized view** `node_skill_cooc(a_id, b_id, cooc, npmi)`.
3. **Population**: a BAML skill-classifier + a one-off backfill + a hook on skill verification;
   a `REFRESH MATERIALIZED VIEW` for the cooc matview on the `node_stats` refresh cadence.
4. **`recommendation.service.ts`**: derive the candidate stack-set, add the drop predicates to
   the unlock query, restrict the "redundant" footer to `generic` skills.
5. **`ranking.contract.ts`**: new constants + the `node_tech_meta` shape.

No destructive change. No change to `ranking.service.ts`, `node_stats`, or the matcher.

## Migration 1 — `node_tech_meta` (additive)

Storage decision: **`category` = `pgEnum`** (8 stable values, matches the project's
`node_type`/`node_status` convention). **`stack` = `text`** validated by a TS const array
`TECH_STACKS` — NOT an enum, because the stack vocab is still being tuned (we may add
`embedded`/`data`/… later, and evolving a pg enum is painful; a const-array change is free).
Booleans for `is_core`/`generic`. Separate additive table (not columns on `nodes`).

```sql
CREATE TYPE skill_category AS ENUM
  ('LANGUAGE','FRAMEWORK','LIBRARY','DATASTORE','CLOUD','TOOL','PRACTICE','SOFT');
CREATE TABLE node_tech_meta (
  node_id  uuid PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  category skill_category NOT NULL,
  stack    text,             -- validated in app vs TECH_STACKS; null = stack-neutral
  is_core  boolean NOT NULL DEFAULT false,
  generic  boolean NOT NULL DEFAULT false,
  classified_at timestamptz NOT NULL DEFAULT now()
);
```
Down: `DROP TABLE node_tech_meta; DROP TYPE skill_category;`. Drizzle: `pgEnum('skill_category', …)`
+ table in `libs/database/src/schema/` (sibling to `node-stats.ts`).

## Migration 2 — `node_skill_cooc` (additive matview)

Skill↔skill co-occurrence over per-vacancy skill-sets (df≥3), with NPMI. Used only for the
substitute/complement call. (SQL proven in `.scratch/skill-weighting/sql/10-build-cooc.sql`.)

```sql
CREATE MATERIALIZED VIEW node_skill_cooc AS
WITH df AS (
  SELECT vn.node_id, count(DISTINCT vn.vacancy_id) AS df
  FROM vacancy_nodes vn JOIN nodes n ON n.id=vn.node_id AND n.status<>'HIDDEN' AND n.type='SKILL'
  GROUP BY vn.node_id HAVING count(DISTINCT vn.vacancy_id) >= 3),
vs AS (SELECT DISTINCT vn.vacancy_id, vn.node_id FROM vacancy_nodes vn JOIN df USING(node_id)),
pairs AS (SELECT a.node_id a_id, b.node_id b_id, count(*)::int cooc
  FROM vs a JOIN vs b ON a.vacancy_id=b.vacancy_id AND a.node_id<>b.node_id
  GROUP BY 1,2 HAVING count(*)>=3),
n AS (SELECT count(*)::float8 t FROM vacancies)
SELECT p.a_id, p.b_id, p.cooc,
  ln((p.cooc/(SELECT t FROM n))/((da.df/(SELECT t FROM n))*(db.df/(SELECT t FROM n))))
    / (-ln(p.cooc/(SELECT t FROM n))) AS npmi
FROM pairs p JOIN df da ON da.node_id=p.a_id JOIN df db ON db.node_id=p.b_id;
CREATE INDEX node_skill_cooc_a ON node_skill_cooc(a_id);
```
Refresh `REFRESH MATERIALIZED VIEW node_skill_cooc;` wherever `node_stats` is refreshed. Down:
`DROP MATERIALIZED VIEW node_skill_cooc;`.

## Population — classifying skills

- **BAML function** `ClassifySkills` in `apps/etl/baml_src/` (follows `extract-candidate.baml`
  pattern): input = batch of `{node_id, canonical_name}`, output = `{node_id, category, stack,
  is_core, generic}[]`. System prompt = the rubric in `.scratch/skill-weighting/classify-rubric.md`
  (controlled vocab; "when unsure between a concrete stack and null → null"). Batch ~80–100/call.
- **Backfill script** (`apps/etl/src/.../classify-skills.ts`, one-off CLI): classify all
  **VERIFIED** SKILL nodes (~1 216) first (that is the recommendable set + holds the candidates'
  core skills). NEW skills can be classified lazily/on verification. Cost: a few LLM batch calls,
  one-off. (Experiment did exactly this for 1 228 skills via 12 parallel agents.)
- **Hook**: when a skill is verified (taxonomy curation), enqueue it for classification, so
  `node_tech_meta` stays in sync. Unclassified nodes degrade gracefully (treated as `stack=null`).

## Code — `recommendation.service.ts`

The proven predicates live in `.scratch/skill-weighting/sql/recs-e.sql`. Port them into the
existing `cohortCte` / item query. Concretely, add three CTEs from the candidate refs:

```sql
-- candidate stack profile, from node_tech_meta over the held refs
css        AS (SELECT DISTINCT m.stack FROM cand c JOIN node_tech_meta m ON m.node_id=c.node_id
               WHERE m.is_core AND m.stack IS NOT NULL),
lang_stacks AS (SELECT DISTINCT m.stack FROM cand c JOIN node_tech_meta m ON m.node_id=c.node_id
               WHERE m.is_core AND m.category='LANGUAGE' AND m.stack IS NOT NULL),
fw_stacks  AS (SELECT DISTINCT m.stack FROM cand c JOIN node_tech_meta m ON m.node_id=c.node_id
               WHERE m.is_core AND m.category='FRAMEWORK' AND m.stack IS NOT NULL),
```

Then in the item `WHERE` (after the existing df-floor / df-share guards), `LEFT JOIN
node_tech_meta m ON m.node_id = a.node_id` and add:

```sql
-- F2 foreign-stack tech (covers non-core too): drop concrete-stack lang/framework/library
AND NOT (m.category IN ('LANGUAGE','FRAMEWORK','LIBRARY')
         AND m.stack IS NOT NULL AND m.stack NOT IN (SELECT stack FROM css))
-- F1 already-known primary language (one per stack: TS => JS)
AND NOT (m.category='LANGUAGE' AND COALESCE(m.is_core,false)
         AND m.stack IN (SELECT stack FROM lang_stacks))
-- substitute frameworks: drop a same-stack core framework UNLESS it co-occurs (npmi>=MIN)
-- with a held same-stack core framework (Angular/Vue dropped; Selenium+Appium kept)
AND NOT (m.category='FRAMEWORK' AND COALESCE(m.is_core,false) AND m.stack IN (SELECT stack FROM fw_stacks)
         AND NOT EXISTS (
           SELECT 1 FROM cand h JOIN node_tech_meta hm ON hm.node_id=h.node_id
             AND hm.category='FRAMEWORK' AND hm.is_core AND hm.stack=m.stack
           JOIN node_skill_cooc xc ON xc.a_id=a.node_id AND xc.b_id=h.node_id
           WHERE xc.npmi >= ${SUBSTITUTE_NPMI_MIN}))
```

Redundant footer query: add `AND EXISTS (SELECT 1 FROM node_tech_meta m WHERE m.node_id=c.node_id
AND m.generic)` so only `generic` held skills can be flagged "redundant" (never React/Swift).

**Note on `generic`:** it does NOT block recommending a missing skill — Docker/K8s/CI-CD still
appear as gaps if the candidate lacks them (verified: backend-without-Docker → Docker recommended).
`generic` only governs the redundant footer.

## `ranking.contract.ts`

```ts
export const SUBSTITUTE_NPMI_MIN = 0.30; // below this, two same-stack core frameworks are substitutes
export const TECH_CATEGORIES = ["LANGUAGE","FRAMEWORK","LIBRARY","DATASTORE","CLOUD","TOOL","PRACTICE","SOFT"] as const;
export const TECH_STACKS = ["node","python","java","dotnet","go","php","ruby","cpp","rust",
  "frontend","mobile-ios","mobile-android","mobile-cross","qa","data","devops","blockchain","game"] as const;
export type SkillCategory = (typeof TECH_CATEGORIES)[number];
export interface NodeTechMeta { nodeId: string; category: SkillCategory; stack: string|null; isCore: boolean; generic: boolean; }
```
(`TECH_CATEGORIES` mirrors the `skill_category` pgEnum; `TECH_STACKS` is the `stack` validation
set — `stack` is a plain text column, so extending this array later needs no DB migration.)

## Phasing — one PR, two commits, USER REVIEW BEFORE EACH COMMIT
The user controls each step. Do NOT commit without showing the diff + a plain-language summary
and getting an explicit OK.

1. **Commit 1 — data.** Drizzle schema (`skill_category` pgEnum + `node_tech_meta` table) +
   `node_skill_cooc` matview migration; BAML `ClassifySkills` + backfill CLI (VERIFIED only);
   refresh wired into the `node_stats` refresh job; run the backfill.
   → **STOP. Show the user:** the migration SQL, the Drizzle schema, a sample of the populated
   `node_tech_meta` (e.g. Go/React/Swift/Selenium/Docker rows), and the backfill row-count.
   Explain what was created and confirm it's all additive/reversible. **Commit only after OK.**
2. **Commit 2 — logic.** stack-set CTEs + drop predicates (F1/F2 + substitute) + generic-only
   redundant in `recommendation.service.ts`; contract constants. Update ADR-0009 (or sibling
   ADR-0010) with the gate logic + the "metadata absent = safe no-op" property.
   → **STOP. Show the user:** the service diff, and before/after recommendations for ≥3 stacks
   (run against the dev DB), proving F1/F2/F3 fixed and ranking untouched. **Commit only after OK.**
3. (later, separate) tiered weight / stack-scoped RCA — out of scope here.

## Acceptance criteria
- **Hard gates, all candidate stacks:** 0 already-known recs (incl. TS⇒JS); 0 core flagged
  redundant; ≤1 foreign primary language in top-8 (target 0). (Baseline fails all; gates pass 5/5.)
- **Regression:** ranking (`/cv/:id/matches`) byte-identical (this PR doesn't touch it).
- **No-op safety:** an embedded/hardware candidate (all `stack=null` held skills) gets the same
  list as today — gates must not empty or distort specialized-role recs.
- **Docker/CI-CD still recommended** when genuinely missing (not blocked by `generic`).
- Build green; recommendation query stays single-round-trip (the CTEs add no N+1).

## Rollback
Fully additive: `DROP TABLE node_tech_meta; DROP MATERIALIZED VIEW node_skill_cooc;` and revert the
service to the pre-gate query. `node_stats`, ranking, and the matcher are untouched throughout.

## Decisions (resolved — do NOT re-ask)
1. **Classify VERIFIED-only** (~1 216). NEW skills classified lazily on verification. ✅
2. **Do NOT extend the stack vocab** for v1 (embedded/data/game/blockchain stay `null` →
   safe no-op for specialized roles). `stack` is `text` precisely so this is a free change later. ✅
3. **Taxonomy dedup is NOT a blocker.** The `rest-assured`/`REST Assured` twin is a pre-existing
   taxonomy-quality issue (rare false "already-known"). Handle separately via the `taxonomy-review`
   skill whenever convenient; do not gate this feature on it. ✅

## Reuse — already-built artifacts (don't redo from scratch)
- Proven gate SQL to port into the service: `.scratch/skill-weighting/sql/recs-c.sql`,
  `recs-e.sql`; co-occurrence build: `10-build-cooc.sql`.
- Classifier rubric (BAML system prompt): `.scratch/skill-weighting/classify-rubric.md`.
- **1 228 prod skills already classified:** `.scratch/skill-weighting/dumps/prod-node-tech-meta.tsv`
  (node_ids are PROD ids → load directly for a prod backfill; for the dev DB re-classify or
  remap by canonical name).
- Live validation DB `metahunt_skillweight` (schema `skillweight`) already has populated
  `node_tech_meta` (1 228) + `node_skill_cooc` (49 850) to diff against.
