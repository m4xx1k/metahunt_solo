# reverse-ats — candidate→vacancy fit engine + gap analysis

**Status:** MVP working end-to-end — §1-6 shipped, tested & verified (IDF view,
matcher+endpoints, CV ingestion, matches-by-id, presentable `/reverse-ats` page).
Ranking-quality pass landed (smoothed IDF + Fit-first sort + real filters — see
*Quality pass* below). Next: feedback loop + market-gap (How-we-fast-track below)
**Branch:** `feat/reverse-ats`
**Sits atop:** ADR-0006 (skills are a ranking signal, not a filter), taxonomy-navigation, semantic-dedup
**Date:** 2026-06-03 (rev 2026-06-06: scoring runs in SQL over a `node_stats`
materialized view · rev 2026-06-07: ranking-quality pass — *Quality pass* §
· rev 2026-06-25: **stack-fit soft-demote** — `rankByRefs` now sorts
`on_stack DESC` first, sinking off-stack vacancies (required core tech outside
the candidate's stack-set per `node_tech_meta`) below in-stack ones, soft not
filter; web `MatchCard` shows an «інший стек» badge. IDF/`node_stats` unchanged.
Recommendations gated by the same metadata — ADR-0010. v2 plan: `.scratch/reverse-ats-v2`)

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
- **IDF weighting:** `weight(s) = ln(N/df(s))` where `N` = total vacancies and
  `df(s)` = vacancies carrying skill `s`. Generic skills (e.g. `git`, `English`,
  `scrum`) appear in most vacancies → low `df` ratio → weight near 1 → they
  self-cancel with no blacklist needed. Rare/niche skills score high (e.g.
  `Ariadne` at `df=2` → `ln(6376/2)` ≈ 8.1) but `log` compresses the scale so
  six solid common-skill matches can still out-rank one exotic hit (raw `N/df`
  would give a 1000× gap; `log` shrinks it to ~7×). Materialized as the
  `node_stats` view so the score is a plain join+sum in SQL.
  If the tail over-boosts, bend the curve with `ln(N/(df+k))` — one knob `k`,
  no cliff, nothing deleted. `weight()` lives behind a swappable interface for
  exactly this.
- **Output per card (two axes + diff):** Fit-tier badge · sorted by Relevance ·
  **skill-diff**: ✅ have · ❌ missing (sorted by IDF desc — most valuable gap
  first) · ➕ bonus (your skills they don't even ask for).
- **Gap (per-job)** = `required \ have`, IDF-sorted = "learn this first to close
  *this* job".
- **Role / seniority / english:** soft, **context flags only** in the gap block
  ("needs Senior, you're Middle"); they do NOT enter the score or sort in v1.
  Promote to tie-breakers later only if ranking comes out flat.

### Why these calls (KISS)

- **Per-vacancy, not per-UniqueVacancy:** dedup isn't wired into the feed yet.
  When it is, exclude non-core group members by id — no engine change.
- **Presence-only skills:** accept keyword-stuffing risk in MVP; evidence-gating
  is a clean later add at extraction time.
- **Exact node match only:** the taxonomy already collapses synonyms, so exact
  `node_id` equality *is* semantic match — and stays fully explainable.

## What MVP needs (build plan)

Ordered to **front-load the risk** — does the ranking produce a sensible order?
— before investing in upload UX. Each step independently testable.

1. **[DONE — migration `0015`, `libs/database/src/schema/node-stats.ts`]** Live
   on `feat/reverse-ats`: 5,824 rows (every non-HIDDEN skill carried by ≥1
   vacancy), weights `1.11`(Python, df=2113) → `8.77`(df=1 tail = `ln(6433)`),
   generics self-cancel at the floor. Unique index on `node_id` ✓, `REFRESH …
   CONCURRENTLY` verified. **Status-scope decision:** include **NEW + VERIFIED,
   exclude only HIDDEN** — only ~234 of ~5,800 used skills are VERIFIED, so the
   entire IDF-differentiating long tail lives in NEW; a VERIFIED-only cut would
   flatten ranking to mainstream skills and is the same kind of cliff the IDF
   design rejects. HIDDEN (2 skills) is the one "do not surface" signal, mirrored
   from the feed. **Refresh-at-end-of-ingest: DONE** — `RefreshNodeStatsActivity`
   runs `REFRESH MATERIALIZED VIEW CONCURRENTLY node_stats` as the final step of
   `rssIngestAllWorkflow` (best-effort; the per-vacancy loads are ABANDON children,
   so the view lags ≤1 ingest cycle — fine for IDF).

2. **[DONE — `apps/etl/src/03-discovery/ranking/`]** `RankingService.match` +
   `POST /ranking/match` (and `POST /ranking/resolve` for the skill→node mapping).
   Verified on real data with a live CV (51 résumé skills, 51/51 resolved via
   canonical+alias): top-8 are all Full-Stack/Node roles, ranking driven by rare
   high-weight matches (Passport.js 8.8, Prisma 5.1) while generics (Docker 1.5)
   barely move it; fit tiers + ✅/❌/➕ diff all explainable. 3,785/6,400 vacancies
   overlap ≥1 skill. Implementation: filters are a minimal inline set
   (seniority/source/workFormat) reusing `ELIGIBLE_VACANCY`. Surfaced the parked
   **synonym-miss** for real: recurring `miss: JavaScript` because the CV lists
   TypeScript only — candidate for `related_nodes` later. Pure function
   `rank(candidateNodeIds, filters) → ranked page`. **NOT** the feed's skill
   filter: `feed.search` treats `skillIds` as AND; the matcher is OR-overlap
   *scored* — `JOIN unnest($ids) → vacancy_nodes` (hits the `node_id` index)
   `→ node_stats`, `SUM(weight) = relevance`, `count(*) FILTER (is_required) /
   req_total → fit tier`, `ORDER BY relevance DESC LIMIT/OFFSET`. The skill-diff
   (✅have / ❌missing / ➕bonus) is computed **only for the page's ~20 rows**.

3. **[DONE — migration `0016`, `apps/etl/src/03-discovery/cv/`]** `ExtractCandidate`
   BAML (`extract-candidate.baml`, reuses the vacancy `Seniority`/`EnglishLevel`/
   `Skills` types) → `CandidateExtractor`. Stored as `candidates` (contentHash,
   sourceText, extracted JSON, role/seniority/english/exp) + `candidate_nodes`
   (presence-only). **Decision:** skills are **resolve-only** (`RankingService.resolveSkills`),
   NOT created as `NEW` — an unknown CV skill is `df=0` → weight 0 → inert for
   matching anyway, so creating it only pollutes the taxonomy; unmatched skills
   are kept as strings in `extracted.unmatchedSkills`. Verified on real CV:
   role=Full Stack Developer, SENIOR, 15/15 matched.

4. **[DONE]** `POST /cv` — `FileInterceptor` accepts a PDF/.txt file (PDF→text via
   `unpdf`, pure-JS) **or** raw `{text}`; `GET /cv/:id` reads back the stored
   extraction. **Idempotency:** `sha256` of normalized text = `content_hash`
   (unique) → re-upload returns the existing candidate, skips the LLM (verified:
   2nd POST and the .txt-file upload both `reused:true`, same id). No S3 (JSON only).
   **Cap fixed:** a dedicated `CandidateSkills` class (required≤30 + optional≤15)
   replaces the vacancy `Skills` for `ExtractCandidate` — the real PDF now yields
   **44 matched** skills (was 15). The LLM extractor is a token seam
   (`CANDIDATE_EXTRACTOR`) so tests stub it.

5. **[DONE]** `GET /cv/:id/matches` — `loader.getMatchInput` reads
   `candidate_nodes` (+ node_stats weight) → `RankingService.rankByRefs`. Query
   parsing mirrors `feed.controller` (seniority/source/workFormat/page).

6. **[DONE]** `/reverse-ats` page — hero + sample-profile picker + real CV upload
   (PDF/TXT) → ranked list. **Cards now reuse the actual feed card**: the matcher
   returns the full `VacancyDto` via the new `FeedService.hydrateByIds`, and
   `PublicVacancyCard` was promoted to tier-2 `components/data/` (2nd consumer).
   `MatchCard` = feed card + overlay (tier badge · relevance · ✅/❌/➕ diff).
   First list is SSR'd from a sample profile.

**Refactor / cleanup done this pass** (resolved the §1-review debt): the matcher
no longer reimplements feed display — `FeedService` gained `selectVacancies`
(shared base query) + `hydrateByIds`; `RankingService.match` now wraps
`rankByRefs` so the skills-path and stored-candidate-path share one ranker.

**Tests:** unit (`fitTier`, `extractText`) + integration (`ranking.int`,
`candidate-loader.int` — stubbed extractor, real db: IDF order, fit tiers,
ELIGIBLE gate, resolve canonical/alias, idempotency, resolve-only, hash
normalization). Full suite green: 214 unit + 12 int.

Critical path: §1 → §2 (the risk) is fully independent of §3; §4-5 wire them
together; §6 is the shell.

## Quality pass (rev 2026-06-07 — first real-data eyeball)

Three pathologies surfaced once the page ran on the full corpus. All three were
*anticipated* below ("signals to watch"); the eyeball promoted them to fixes.

1. **Rare skills over-boost (the `passport.js` problem).** A single `df=1` match
   scored `ln(N)` ≈ 8.8 and catapulted an otherwise-weak vacancy to #1. **Fix =
   the documented smoothing**: `ln(N/df)` → `ln(N/(df+5))` in the `node_stats`
   view (migration `0017`). Settles `df=1` from 8.77 → **6.98** (verified), eases
   the whole tail down with no cliff, generics unmoved at the floor. `K=5` is the
   single tuning point in `node-stats.ts`. (Watch: on a tiny corpus `df+5 > N`
   makes weights negative — irrelevant in prod where `N≈6.4k ≫ df+5`, but the
   ranking int test had to pad its fixture corpus to stay non-degenerate.)

2. **One rare skill out-ranking a broad fit.** Pure `ORDER BY relevance` let a
   lone niche bonus skill beat a job the candidate broadly qualifies for. **Fix =
   promote Fit to the primary sort bucket**: `ORDER BY tier_bucket DESC, relevance DESC`
   where `tier_bucket` = STRONG 2 / GOOD 1 / STRETCH 0 (computed in the ranked
   SQL via a `req` CTE for `required_total`). Relevance now only orders *within*
   a tier. Two axes, still no fused fake %.

3. **Same vacancy at #1 and #13.** Not one row twice (`GROUP BY vacancy_id`
   forbids it) — **two duplicate vacancies** (re-post / cross-source) whose
   independent extractions disagreed on skills. The *proper* fix is semantic-dedup
   (score the group's core member / skill-union, exclude the rest by id — no
   engine change). **Still open** — smoothing (#1) only softens how far the dup
   drifts.

**Filters, now real.** `MatchFilters`:
`seniorities: Seniority[]` (OR — middle ∪ senior, was a single `=`),
`workFormat` (REMOTE), `postedWithinDays` (`coalesce(published_at, loaded_at) >
now() - make_interval`, mirrors the feed's freshness coalesce). Both controllers
parse them (`/ranking/match` JSON array · `/cv/:id/matches` CSV query); the
`/reverse-ats` page got a chip filter bar that re-ranks the active candidate
(sample or CV) on toggle. Still ranking signals layered on a *filtered* set —
ADR-0006 intact (filters narrow the corpus, skills still rank within it).

## Refactor pass (rev 2026-06-07 — audit-driven cleanup)

1. **Fit-tier thresholds — one source of truth.** `FIT_STRONG_MIN`/`FIT_GOOD_MIN`
   in `ranking.contract.ts`; both `fitTier` (badge) and the SQL tier-bucket
   (sort) read them, so the displayed tier can't drift from the sort order.

2. **Shared request-parsing home.** `platform/shared/query-parsing.ts` (inputs
   typed `unknown` → serves both GET-query and POST-body) + `platform/shared/
   sql.ts` (`uuidList`). Deleted the per-controller `parseEnum`/`parsePage`/
   `parsePageSize`/`parseId`/`parseDays`/`parseBool` copies across **6
   controllers** (feed, cv, ranking, taxonomy, dedup, monitoring) and the
   stray `admin/monitoring/query-parsing.ts`; centralised the inline `uuidList`
   (was re-rolled in feed.service + ranking.service).

3. **Filter primitives → tier-2.** `pill` / `Section` / `EnumSection` / filter
   `types` promoted from the feed's page-private `market-snapshot/filters/` to
   `components/data/filters/` (the rule-of-three second consumer — reverse-ATS —
   arrived). Feed consumers unchanged (barrel re-exports). The `/reverse-ats`
   filter bar now uses the shared `pillClass` instead of a hand-rolled chip.

4. **Pagination — tier-2 + callback mode + wired into reverse-ATS.** The pager
   moved to `components/data/Pagination.tsx` and gained an `onNavigate(offset)`
   mode for client islands (the feed/investigation link mode stays). The
   `/reverse-ats` page previously fetched only page 1 — it now has page state +
   the shared pager. **Deferred (Path B):** full URL-state unification of the
   ATS page + a feed↔ATS mode toggle (needs UX sign-off).

Verified: etl 212 unit + 12 int green; web tsc + lint clean; `build:web` all
routes compile.

## Hardening pass (rev 2026-06-07 — toward "give it to testers")

- **Abuse guards.** `@nestjs/throttler` global backstop (300/min/IP — high so
  feed SSR, which shares the Vercel IP, never trips it) + a strict `@Throttle`
  on `POST /cv` (5/min per real browser IP, since each new CV = a BAML call) +
  a 5 MB upload cap on the `FileInterceptor`.
- **Filter depth.** `MatchFilters` grew: `workFormats[]` (was a single REMOTE
  toggle), `englishLevels[]` (UI shows CEFR — A2/B1/B2…), `employmentTypes[]`,
  `hasTestAssignment` (false keeps unknowns, mirrors feed), `hasReservation`
  (military deferment filter), and `minFitTier` (hide below a coverage tier). The
  Fit-tier filter reads the computed `tier_bucket`, so `rankByRefs` now builds a
  shared `ranked` CTE that both the page and count queries filter on. Enum
  value-arrays (`ENGLISH_LEVEL_VALUES`, `EMPLOYMENT_TYPE_VALUES`,
  `FIT_TIER_VALUES`) added so the boundary validates without redeclaring sets.
  (Salary deliberately skipped.)
- **node_stats freshness.** Refresh wired into ingest (see build-plan §1).
- **Entry point.** Header CTA "Coming soon" → link to `/reverse-ats`.

Verified: etl tsc + 212 unit + 8 int green, `nest build` ok; web tsc + lint +
`build:web` ok; the refactored ranked query + new filters smoke-tested on real db.

## Presentable pass (rev 2026-06-07 — looks-good-for-users)

- **Feed-style sidebar.** New page-private `MatchFilters` mirrors `MarketFilters`:
  a sticky left column on lg+ (`lg:grid-cols-[300px_minmax(0,1fr)]`), collapsed
  behind one toggle on <lg. It composes the **same tier-2 primitives the feed
  uses** — `EnumSection` (now with an additive multi-select mode for the
  candidate's OR-filters), `PerksFilter` (promoted to tier-2; military deferment
  and no-test-assignment perks reused verbatim), and `Section`. The flat top
  filter bar is gone. Filter model (state + enum→label option sets) extracted to
  `_components/filter-model.ts`.
- **Extraction display.** New `CandidateProfile` (a styled right-rail panel on
  xl+, first thing when stacked) surfaces what the engine understood — role +
  seniority (uploaded CV), matched/vacancy stat counters, resolved skills as
  chips (sorted popular-first — low IDF weight = high df), and unmatched strings
  — so the user sanity-checks before trusting the rank. Replaces the old one-line
  resolved summary.
- **Polish.** Sticky blurred header, slimmer hero, three-column layout (filters ·
  results · CV profile) collapsing to a sensible mobile stack, improved
  empty/error states; responsive via the feed's grid + the Section accordion.

Verified: web tsc + lint clean; `build:web` (feed + ATS routes) green.

## What to look at AFTER MVP (signals to watch, not build)

- ~~**Ranking flatness.**~~ **Partially addressed** (Quality pass #2): Fit-tier is
  now the primary sort bucket. Role/seniority tie-breakers within a tier are still
  available if relevance ties inside a bucket.
- **Keyword-stuffing.** If padded CVs rank fake-high → add evidence-gating
  (skill counts only if it appears in an experience bullet, not just "Skills:").
- **Synonym misses.** If candidate skills legitimately miss related job skills
  (`Postgres` vs `MySQL`) → partial credit via a `related_nodes` graph or node
  embeddings. Keep explainability anchored on explicit nodes.
- **Coverage at scale.** If vacancy count grows large → two-stage retrieve
  (pgvector ANN on a CV embedding) + rerank. Embedding column already exists on
  `vacancies`; add the mirror on `candidates`.
- ~~**IDF quality.**~~ **Addressed** (Quality pass #1): smoothed to `ln(N/(df+5))`
  in migration `0017`; `df=1` tail now 6.98, no cutoff. `K` remains the single
  tuning point — revisit if the tail still over-boosts after dedup lands.
- **Calibration.** No ground truth yet — weights are expert guesses until we
  have a feedback signal (below).
- **Duplicate vacancies in results.** Semantic-dedup (score the group's core
  member, exclude the rest by id) is the proper fix; still open.

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

- ~~**CV-origin nodes**~~ **RESOLVED:** moot — CV skills are resolve-only (never
  create nodes), so there's nothing to tag. Unmatched skills live as strings on
  the candidate, not in `nodes`.
- ~~**Candidate ↔ user link**~~ **RESOLVED (MVP):** anonymous — no `users` link.
  Revisit with profile-persistence (How-we-fast-track §3).

## Out of scope (v1)

Embeddings, evidence-gating, related-skill partial credit, domain scoring,
recruiter-side matching, single fused score, ANN recall.

## Links

- ADR-0006 — skills as ranking signal (`md/journal/decisions/0006-skills-as-ranking-signal.md`)
- taxonomy-navigation — shared node/track model
- semantic-dedup — UniqueVacancy grouping (future match unit)
