# reverse-ats — candidate→vacancy fit engine + gap analysis

**Status:** in progress — §1 (`node_stats` view) shipped & verified
**Branch:** `feat/reverse-ats`
**Sits atop:** ADR-0006 (skills are a ranking signal, not a filter), taxonomy-navigation, semantic-dedup
**Date:** 2026-06-03 (rev 2026-06-06: scoring runs in SQL over a `node_stats` materialized view)

## Problem

A candidate uploads a CV → we want to show the best-fitting vacancies and, per
job, *what's missing*. This is **reverse-ATS**: an ATS ranks candidates for one
requisition; we rank vacancies for one candidate. It cannot be a boolean filter
(AND drops a 7/8 match for one gap; OR floods with no order) — it is a **ranking
+ explanation** problem. ADR-0006 already settled the principle; this tracker is
the concrete v1 engine, the MVP build, and the path to users.

## How real ATS engines work (what we copy / reject)

Every match engine is the same 5 steps: `parse → normalize to a shared
vocabulary → field-by-field compare → weighted aggregate → rank`. All the
intelligence lives in two places: the **shared vocabulary** (so synonyms
collapse) and the **weights**.

- **Gen-1 (Taleo/Workday/iCIMS):** resume parser → fields; match = weighted
  keyword presence; `required` > `preferred`; title + years weigh heavily;
  knockout questions = hard gates. Failure mode: rejects qualified people over a
  missing keyword (the "ATS black hole").
- **Gen-2 (Eightfold/LinkedIn/HiredScore):** + a **skill ontology** (normalize
  `React.js→React`, know `React ⊂ Frontend`), inferred skills, embeddings, and a
  model trained on hire/interview outcomes.

We **copy**: asymmetric coverage (extra CV skills are neutral); `required` ≠
`preferred`; weight by skill rarity. We **reject**: hard knockouts — we never
"reject" a candidate, we rank + show the gap. Our **edge**: the ontology (`nodes`
+ `tracks`) already exists and is *shared with dedup* — Gen-2's hardest piece is
half-built.

## Engine v1 (locked)

Asymmetric, skills-centric, single pass over the overlap set.

```
candidate = set of skill node_ids   (presence-only; + role, seniority as context)
overlap   = candidateSkills ∩ skills(vacancy)        // EXACT node_id match only

Fit       = |have ∩ required| / |required|           // 0..1 → tier badge
Relevance = Σ weight(s)  for s ∈ overlap              // sort key
weight(s) = log(N / df(s))                            // IDF, ISOLATED behind a fn
```

- **Fit** answers "am I qualified?" → tier **Strong / Good / Stretch** (never a
  fake %). `|required| = 0` → neutral (treat as Good).
- **Relevance** answers "does it use my strengths?" → the **sort order**.
- **IDF weighting** makes generic noise (git/english/scrum) self-cancel — no
  `is_generic` blacklist needed (full intuition in *Why IDF* below). `N` = total
  vacancies, `df(s)` = vacancies carrying skill `s`. Materialized as the
  `node_stats` view so the score is a plain join+sum in SQL (build plan §1-2).
- **Output per card (two axes + diff):** Fit-tier badge · sorted by Relevance ·
  **skill-diff**: ✅ have · ❌ missing (sorted by IDF desc — most valuable gap
  first) · ➕ bonus (your skills they don't even ask for).
- **Gap (per-job)** = `required \ have`, IDF-sorted = "learn this first to close
  *this* job".
- **Role / seniority / english:** soft, **context flags only** in the gap block
  ("needs Senior, you're Middle"); they do NOT enter the score or sort in v1.
  Promote to tie-breakers later only if ranking comes out flat.

### Why IDF — the weight, intuitively

The one non-obvious piece, spelled out from zero. `weight(s)` answers *how strong
a signal is this match?* — because matches aren't equal. A match on `Python` (half
the market wants it) proves almost nothing; a match on `Ariadne` (niche GraphQL
lib, 2 vacancies in the whole corpus) is a bull's-eye. So we need a number that's
**big for rare skills, ~0 for mass-market ones**. Two steps build it:

1. **Rarity = `N / df`** — "one in how many vacancies." `Python` → 6376/2101 ≈ 3
   (every third job). `Ariadne` → 6376/2 ≈ 3188 (one in three thousand). Raw N/df
   already separates mass from rare.
2. **Why the `log`** — Relevance *sums* weights over the overlap. With raw N/df one
   exotic match (Ariadne = 3188) buries six solid ones (Python+SQL+Docker+AWS+
   Redis+Kafka ≈ 40 combined): the scale blows up ~1000×, so a broad confident
   match loses to one lottery tick. `log` compresses it — the Python→Ariadne gap
   shrinks from 1000× to ~7× (1.1 → 8.1), so six normal matches can out-rank one
   rare hit. Log = "rarity in **orders of magnitude**" (same reason Richter,
   decibels, star magnitudes are log): one order rarer = +1 weight, even steps
   instead of an explosion.

**One-line version:** weight = how rare a skill is, in orders of magnitude. Generic
skills land at ~1 (self-cancel, no blacklist); a skill an order rarer is worth +1.
We sort vacancies by the sum of these over the matched skills.

### The fat tail (`df=1`) — why we never skip it

~2800 skills sit at `df=1` (one vacancy), ~1000 at `df=2` — nearly half the
taxonomy maxes out the weight (`df=1` → `ln(6376/1)` ≈ 8.76). The instinct is to
drop `df=1` as noise. **We don't, on principle:**

- A `df=1` match is two things we can't yet tell apart: garbage (typo / extractor
  hallucination / hyper-specific phrase) **or** the most informative match the
  engine can make (the one candidate with the one niche skill the one job wanted).
  A hard skip kills the best signal to remove the worst — baby with the bathwater.
- A cutoff is a cliff, not a slope: why is `df=1` worth zero but `df=2` worth full
  8.76? No principled answer — that's the brittle `is_generic` blacklist ADR-0006
  deleted, reborn as a threshold. And it doesn't even fix noise: a typo at `df=2`
  still scores 8.07, so you'd keep raising the floor — back to manual tuning.
- The noise mostly self-cancels anyway: a garbage `df=1` node hurts *only* if a CV
  *independently* resolves to that same node — but a typo in one vacancy won't be
  reproduced by a different CV's text (different text → resolves elsewhere). Junk
  `df=1` nodes sit inert in the corpus; the `df=1` nodes that *do* match are
  disproportionately the real-rare ones.
- **If the tail ever does fizz**, bend the curve, don't cut it: `ln(N/(df+k))`
  (e.g. `k=5`) settles `df=1` from 8.76 → ~6.97 and the whole tail eases down with
  no discontinuity. Nothing is ever deleted, everything stays in the diff and
  explainable, tuning is one knob `k` — not a growing exception list. This is the
  whole reason `weight()` lives behind a swappable interface.

### Why these calls (KISS)

- **Per-vacancy, not per-UniqueVacancy:** dedup isn't wired into the feed yet.
  When it is, exclude non-core group members by id — no engine change.
- **Presence-only skills:** accept keyword-stuffing risk in MVP; evidence-gating
  is a clean later add at extraction time.
- **Exact node match only:** the taxonomy already collapses synonyms, so exact
  `node_id` equality *is* semantic match — and stays fully explainable.

## What MVP needs (build plan)

Ordered to **front-load the risk** — does the ranking produce a sensible order?
— before investing in upload UX. Steps 1-2 are testable with a hand-picked node
set, no CV. Each step independently testable.

1. **[DONE — migration `0015`, `libs/database/src/schema/node-stats.ts`]** Live
   on `feat/reverse-ats`: 5,824 rows (every non-HIDDEN skill carried by ≥1
   vacancy), weights `1.11`(Python, df=2113) → `8.77`(df=1 tail = `ln(6433)`),
   generics self-cancel at the floor. Unique index on `node_id` ✓, `REFRESH …
   CONCURRENTLY` verified. **Status-scope decision:** include **NEW + VERIFIED,
   exclude only HIDDEN** — only ~234 of ~5,800 used skills are VERIFIED, so the
   entire IDF-differentiating long tail lives in NEW; a VERIFIED-only cut would
   flatten ranking to mainstream skills (the parked "ranking flatness" risk) and
   is the same kind of cliff the fat-tail section rejects. HIDDEN (2 skills) is
   the one "do not surface" signal, mirrored from the feed. Refresh-at-end-of-
   ingest wiring is still TODO (the `REFRESH` call in the ingest workflow).

   _Original plan:_ A `pgMaterializedView` over
   `vacancy_nodes`: `node_id`, `df = count(distinct vacancy_id)`, `weight =
   ln(N/df)` (`N = (select count(*) from vacancies)`). Naturally skills-only —
   `vacancy_nodes` is the skill join table; role/domain are FK columns on
   `vacancies`. A `REFRESH MATERIALIZED VIEW CONCURRENTLY node_stats` runs as the
   final activity of the ingest workflow (after 02-enrich load). `CONCURRENTLY`
   keeps the feed/matcher readable during refresh and **requires a UNIQUE index
   on `node_id`**. The weight stays swappable — the smoothed `ln(N/(df+k))` is one
   edit to the view definition. Testable with one `SELECT ... ORDER BY weight`:
   generic skills land ~1, niche ones ~8.7.
2. **Matcher — SQL ranking query.** Pure function `rank(candidateNodeIds,
   filters) → ranked page`. **NOT** the feed's skill filter: `feed.search` treats
   `skillIds` as AND (`HAVING count(distinct node_id) = len`); the matcher is
   OR-overlap *scored* — `JOIN unnest($ids) → vacancy_nodes` (hits the `node_id`
   index) `→ node_stats`, `SUM(weight) = relevance`, `count(*) FILTER
   (is_required) / req_total → fit tier`, `ORDER BY relevance DESC LIMIT/OFFSET`.
   Filters (seniority/source/…) reuse `feed.service`'s `buildWhere`. The
   skill-diff (✅have / ❌missing / ➕bonus) is computed **only for the page's ~20
   rows**, not the whole corpus. Testable with a hand-picked node_id array — no CV
   needed; compare against an in-process reference on the same data (kept as the
   correctness oracle, not the prod path).
3. **Candidate extraction + storage.** New `ExtractCV` BAML reusing the vacancy
   extractor's enums + node-resolution pipeline (`NodeResolverService.resolve`
   already race-safe-creates `NEW` nodes). Output: skill node_ids, role,
   seniority, english, experience_years. Store a `candidates` row (extracted JSON,
   role/seniority/english, optional embedding for later) + `candidate_nodes`
   (mirror of `vacancy_nodes`, presence-only — no `is_required`). Unknown skills
   grow the taxonomy as `NEW` (CV-origin tag deferred, see open Q). *Schema
   designed on the branch.*
4. **CV upload.** `POST /cv` (`FileInterceptor`; `@nestjs/platform-express` is
   already a dep): PDF → text → `ExtractCV` → store → return `{ candidateId }`.
   No S3 in MVP — persist only the extracted JSON.
5. **Matches API.** `GET /cv/:id/matches` → reads `candidate_nodes` → matcher.
   Query parsing mirrors `feed.controller`. Sort by relevance, tier by fit.
6. **Minimal UI.** Upload box → ranked list reusing the feed card + diff chips
   (✅/❌/➕) + tier badge. "Best match" sort becomes the default post-upload.

Critical path: §1 → §2 (the risk) is fully independent of §3; §4-5 wire them
together; §6 is the shell.

## What to look at AFTER MVP (signals to watch, not build)

- **Ranking flatness.** If many vacancies tie on relevance → add role/seniority
  tie-breakers (the parked context flags).
- **Keyword-stuffing.** If padded CVs rank fake-high → add evidence-gating
  (skill counts only if it appears in an experience bullet, not just "Skills:").
- **Synonym misses.** If candidate skills legitimately miss related job skills
  (`Postgres` vs `MySQL`) → partial credit via a `related_nodes` graph or node
  embeddings. Keep explainability anchored on explicit nodes.
- **Coverage at scale.** If vacancy count grows large → two-stage retrieve
  (pgvector ANN on a CV embedding) + rerank. Embedding column already exists on
  `vacancies`; add the mirror on `candidates`.
- **IDF quality.** Watch the fat tail (`df=1`, see *Why we never skip it*): if a
  CV coincides with a junk single-vacancy node it gets an outsized boost. Remedy is
  the smoothed `ln(N/(df+k))`, not a cutoff — the `node_stats` view's weight
  expression is the single tuning point.
- **Calibration.** No ground truth yet — weights are expert guesses until we
  have a feedback signal (below).

## How we fast-track it to users (after MVP works)

1. **Feedback loop = the unlock.** Add a lightweight "I'd apply / not for me"
   tap on each match. This is the *only* way to prove the engine beats random
   and to calibrate weights. Cheapest high-leverage addition — do it first.
2. **Market gap (the wow feature).** Aggregate per-job gaps across the whole
   feed: *"learn Kafka → +37 vacancies unlock, avg fit +12%"*. Same overlap
   math, inverted and summed. This is the career-coach view users will share.
3. **Profile persistence.** Save the extracted CV as a reusable candidate
   profile → re-rank on every new ingest → notify (reuses tg-notifications) when
   a strong new match appears.
4. **Sort/tier polish.** "Best match" vs "Newest" toggle; growth framing on the
   card ("2 skills from a full match"), never "you don't qualify".

## Decisions (locked v1)

- Candidate-facing, single CV → rank all vacancies.
- Skills-centric score: **Fit (coverage) + Relevance (Σ IDF)**, two axes, no
  single fake %.
- Asymmetric: extra CV skills neutral.
- Exact node match only; presence-only skills; per-vacancy unit.
- Role/seniority/english = context flags, not scored.
- Per-job gap now; market-aggregate gap later.
- Weight fn = `log(N/df)`, isolated in the `node_stats` view (swap to
  `ln(N/(df+k))` = one edit to the view).
- **Scoring runs in SQL** (aggregate over join), not in-process — ranking,
  pagination, and filters all happen in the DB; `ORDER BY relevance LIMIT/OFFSET`.
- IDF weights live in a **`node_stats` materialized view**, refreshed
  `CONCURRENTLY` at the end of ingest (needs a unique index on `node_id`).

## Open (decide on the branch)

- **CV-origin nodes:** new `NEW` node tagged CV-origin vs a flag/column on
  `nodes` — leaning a `source`/origin marker on `nodes` over a parallel table.
- **Candidate ↔ user link:** tie a candidate to a waitlist `users` row, or keep
  anonymous in MVP.

## Out of scope (v1)

Embeddings, evidence-gating, related-skill partial credit, domain scoring,
recruiter-side matching, single fused score, ANN recall.

## Links

- ADR-0006 — skills as ranking signal (`md/journal/decisions/0006-skills-as-ranking-signal.md`)
- taxonomy-navigation — shared node/track model
- semantic-dedup — UniqueVacancy grouping (future match unit)
