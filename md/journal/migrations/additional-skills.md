# additional-skills — "skills you probably already have" (confirm-to-add)

**Status:** 🟢 v1 PROTOTYPE BUILT (2026-07-10) — see "Implementation" below
**Branch:** `feat/additional-skills`
**Sits atop:** reverse-ATS (ADR-0006), cv-skill-recommendations (ADR-0009), skill-metadata gates (ADR-0010)
**Date:** 2026-07-10

## Problem

After a CV upload, metahunt extracts the skills the candidate *named* into
`candidate_nodes` (presence-only SKILL links; see `candidates.ts`). But a CV
under-lists: someone who writes "TypeScript" almost never also writes
"JavaScript"; a Django dev rarely re-lists "Python". Those implied skills never
enter `candidate_nodes`, so they don't count toward vacancy matching — the
candidate silently loses ✅ coverage on jobs that tag the base skill.

**Feature:** after extraction, surface a short list of skills the candidate
*probably already has but didn't list* ("Ви, ймовірно, також знаєте: JavaScript"),
each with a one-line reason. The user taps to confirm; confirmed skills are
written to `candidate_nodes` and immediately count toward matching + re-rank.

The hard constraint the founder set: **be conservative.** Never claim "you know
Kubernetes" from weak signal. A false suggestion is worse than a missing one.

## Does the "learn next" widget map 1:1? — NO. (this is the heart)

The founder's hypothesis is **confirmed by the code**: same data sources,
opposite direction, different metric, different threshold philosophy. Evidence:

### What "learn next" actually is (recommendation.service.ts)

The widget is a **marginal counterfactual over a market cohort**, not a statement
about the candidate:

- Cohort = other vacancies for the candidate's role + seniority band
  (`recommend()` takes `roleNodeId`, `seniority`; cohort built in `cohortCte`).
- It scores skills the candidate **does NOT have** (`unlock` CTE:
  `WHERE NOT vr.in_cand`) by how many *near-miss cohort vacancies* they'd push
  into ≥GOOD coverage (`unlocks`), ordered by that count then IDF.
- Guardrails are **market-shaped**: cohort df-floor (`REC_DF_FLOOR=5`, drop
  niche), generic df-ceiling (`REC_GENERIC_DF_SHARE=0.6`, drop "everyone has
  it"), `REC_MIN_COHORT=20`. None of these make sense for "already have".
- Semantics = **aspirational / gap**: forward-looking, "learn X → +N jobs".

### The decisive evidence: learn-next already computes "already have" — to throw it away

`recommendation.service.ts` has an **F1 gate** (ADR-0010) whose entire job is to
suppress a skill the candidate *already implicitly has* from the learn-next list:

```sql
-- F1 already-known primary language: a stack has one primary language, so
-- a core language in a stack the candidate already has one for is known (TS => JS).
AND NOT (m.category = 'LANGUAGE' AND COALESCE(m.is_core, false)
         AND m.stack IN (SELECT stack FROM lang_stacks))
```

So the exact TS⇒JS implication the new feature must **surface** is the one
learn-next already **subtracts**. The two features are two sides of one
`node_tech_meta` coin: learn-next says *"don't suggest JS, you have TS"*;
already-have says *"add JS, because you have TS"*. This is the strongest proof
they are not the same engine — they use one shared predicate in opposite polarity.

### The precise diff

| Axis | learn-next (ADR-0009/0010) | already-have (this doc) |
|---|---|---|
| Direction | skills you **lack** that unlock jobs | skills you **lack but imply** having |
| Depends on market cohort? | **yes** (role+seniority vacancies) | **no** — purely about the candidate's own skill set |
| Core signal | marginal unlock count over cohort + IDF | asymmetric prerequisite/implication |
| Threshold philosophy | high-recall, market-tuned floors/ceilings | high-precision, conservative, confirm-gated |
| Co-occurrence role | substitute gate only (framework A vs B) | **must not** drive it (symmetric ≠ implication) |
| Output framing | "+N jobs", green payoff bars | "you also know", neutral confirm chips |

### Reuse vs must-differ (concrete)

**Reuse as-is:**
- Skill→node resolution + weighted candidate nodes: `RankingService.resolveSkills`,
  `CandidateLoaderService.weightedMatchedNodes` (already the ranking input path).
- `node_tech_meta` (`category`/`stack`/`is_core`) — the F1 predicate logic and
  the `lang_stacks` CTE, **inverted from subtractive to additive**.
- The "metadata absent ⇒ safe no-op" property (ADR-0010): a candidate whose
  held skills carry no `node_tech_meta` row simply gets no suggestions.
- `node_stats` IDF weight for the confirmed skill (matching already reads it).

**Must differ:**
- No cohort, no near-miss counterfactual, no `REC_*` floors/ceilings, no
  `REC_MIN_COHORT` reduced-state — irrelevant to a per-candidate implication.
- `node_skill_cooc` / NPMI is **not** the v1 driver. Co-occurrence is symmetric
  and market-driven (Docker↔K8s co-occur), so it produces exactly the false
  "you know Kubernetes" we must avoid. Implication is **asymmetric**
  (Next.js⇒React, not React⇒Next.js). Wrong tool for v1.

**Verdict:** share the data + plumbing, write a new small derivation. Do **not**
fork or generalize `recommendation.service.ts`.

## Data model

**Where confirmed skills live:** `candidate_nodes` — the same table ranking
already reads (`weightedMatchedNodes`). Adding a confirmed row makes it count
toward matching with zero ranking changes.

**One additive column** to tell apart how a link arose:

```ts
export const skillSource = pgEnum("skill_source", ["extracted", "confirmed"]);
// candidate_nodes: + source skillSource("source").notNull().default("extracted")
```

- `extracted` — written at ingest (existing rows backfill to this default).
- `confirmed` — the user tapped a suggestion. Lets us (a) render extracted vs
  confirmed differently, (b) never re-suggest a confirmed/known skill, (c) keep
  the option to weight them differently later without a migration.

**`node_tech_meta` reuse — no new curated table for v1.** The prerequisite
signal is *derivable* from existing `category` + `stack` + `is_core`:
- a stack has one primary core LANGUAGE (the `lang_stacks` assumption already
  in production) → holding TypeScript (core LANGUAGE, stack `frontend`/`node`)
  implies JavaScript;
- holding a core FRAMEWORK/LIBRARY implies that stack's primary language
  (Django⇒Python, Spring⇒Java, React⇒JavaScript).

A **curated `node_implies` edge** (asymmetric prerequisite pairs) is a v2
sharpening for cases metadata can't derive (e.g. Next.js⇒React within one
stack). Not needed for v1 — co-occurrence-derived edges are explicitly rejected
(symmetric). See Phases.

## Suggestion algorithm (v1)

Input: candidate's confirmed+extracted `candidate_nodes`. No cohort. Single
query, mirroring the F1/`lang_stacks` CTEs but selecting instead of excluding:

1. Build the candidate's `lang_stacks` (stacks where they hold a core LANGUAGE)
   and `held_stacks` (stacks where they hold any core skill) from
   `node_tech_meta`, exactly as `recommendation.service.ts` does.
2. Candidate implied-language set = for each stack in `held_stacks`, that
   stack's primary core LANGUAGE node (from `node_tech_meta`).
3. Suggestions = implied-language nodes that are **VERIFIED**, **not already in
   `candidate_nodes`** (neither extracted nor confirmed), and whose stack the
   candidate demonstrably works in.
4. Attach a `reason` = the held skill that triggered it ("бо ви вказали
   TypeScript" / derived from React).
5. Cap at a small N (e.g. 3–4). Order by IDF desc for stable display.

Conservatism levers (all structural, no thresholds to tune):
- **asymmetric only** — only the base-language / prerequisite direction, never
  the specialization direction (React does not imply Redux).
- **VERIFIED-only + confirm-gate** — the user is the final filter.
- **metadata-absent ⇒ empty** — unclassified/NEW held skills contribute nothing
  (same safe no-op as ADR-0010).

## Ranking / matching changes

Essentially none — that's the payoff of storing in `candidate_nodes`. Once a
confirmed row exists, `weightedMatchedNodes` picks it up and every downstream
consumer (`rankByRefs`, the ✅/❌/➕ diff, learn-next cohort input) sees it for
free.

**Weight parity — YES, weight a confirmed skill the same as an extracted one.**
Rationale: (a) the suggestion is a genuine prerequisite the user explicitly
confirmed, so it's real possession, not a guess; (b) implied base languages
(JavaScript, Python) are typically low-IDF/generic, so they barely move the
`relevance` sort anyway — their real value is restoring ✅ required-coverage on
jobs that tag the base skill, which coverage math already handles. Introducing a
discount factor is complexity with no evidence behind it (KISS). The `source`
column preserves the option to revisit without a migration.

## UI plan

Location: inside `features/cv-match/CandidateProfile.tsx`, near the extracted
skill list — **not** in the learn-next rail.

- A labeled row: **"you probably also know:"** followed by suggestion chips.
- Each chip: skill name + a `?`/dotted-underline tooltip with the reason
  ("implied by TypeScript"), reusing the existing `Tooltip` primitive.
- Tap a chip → **optimistic add**: chip moves into the confirmed-skills group,
  `POST /cv/:id/skills` fires, and the `/matches` query is invalidated so the
  ranked list re-ranks. On error, revert the chip.
- Confirmed skills render with a subtle marker distinct from extracted ones
  (the `source` column), so the user sees what they added.

New backend surface (thin, mirrors existing CV controller):
- `GET /cv/:id/skill-suggestions` → `[{ nodeId, name, reason }]`.
- `POST /cv/:id/skills` `{ nodeId }` → inserts `candidate_nodes` row with
  `source='confirmed'` (idempotent `onConflictDoNothing`), returns updated
  matched set. Reuse the CV throttle guard.

### Avoiding confusion with the learn-next widget

These must never read as the same thing:

- **Different region** — already-have sits with *your profile/skills*;
  learn-next stays in its green "what to learn next" rail.
- **Different verb & framing** — "you also know / add" (possession, confirm) vs
  "learn next / +N jobs" (aspiration, payoff bars). No "+N" on suggestion chips.
- **Different visual** — neutral confirm chips vs green payoff bars + ⚡.
- **No overlap, guaranteed by construction** — a skill surfaced as already-have
  is exactly one the F1 gate already suppresses from learn-next, so the same
  skill can never appear in both lists. Confirmed skills also drop out of future
  suggestions (they're now in `candidate_nodes`).

## Phased plan

**v1 (lean, one branch):**
1. `feat(db)` — `skill_source` enum + `candidate_nodes.source` column (default
   `extracted`; existing rows backfill).
2. `feat(ranking)` — `AdditionalSkillsService` (derive implied languages from
   `node_tech_meta`, exclude held/confirmed), unit test on the pure
   derivation like `recommendation.derive.spec.ts`.
3. `feat(cv)` — `GET /cv/:id/skill-suggestions`, `POST /cv/:id/skills`; loader
   insert path with `source='confirmed'`.
4. `feat(web)` — suggestion chips in `CandidateProfile`, optimistic add,
   re-rank via query invalidation, API fetcher in `lib/api`.

**v2 (later, evidence-driven):**
- Curated `node_implies` asymmetric edge table for cases metadata can't derive
  (Next.js⇒React, etc.); still confirm-gated.
- Optional co-occurrence as a *secondary, clearly-labeled "maybe"* signal, only
  with a high NPMI floor **and** an asymmetry guard — kept out of v1 on purpose.
- Persist confirmations across CV re-upload / edits by tying `candidate_nodes`
  to an account (blocked on the auth initiative; today a re-uploaded *edited* CV
  is a new candidate row and loses confirmations — acceptable for v1).

## Implementation (v1 prototype — 2026-07-10)

The doc above proposed asymmetric implication (TS⇒JS) only, and the first build
used a hardcoded `IMPLIES` map. **Both were dropped** after two data checks and a
reframe:

1. **Neither IDF nor co-occurrence can derive the semantic "TS⇒JS".** TypeScript's
   IDF is *lower* than JavaScript's (df 1291 vs 1038), and vacancy co-occurrence
   points the wrong way too: P(TS|JS)=0.51 > P(JS|TS)=0.41. Both measure "demanded
   together", not "one implies the other". A true implication is domain knowledge,
   not derivable from this corpus — which is the *only* thing the curated map was for.

2. **Reframe: the feature is confirm-gated, so optimize recall, not precision.** The
   founder wants breadth (e.g. "I know MongoDB, just didn't list it"). Since nothing
   is auto-added — the user taps chips — a wrong suggestion is free to ignore; the
   real cost is a *missing* real skill. So the ultra-conservative asymmetric-only
   design was mis-calibrated for an auto-apply world it isn't.

**As-built:** fully data-driven from `node_skill_cooc`, no hardcoded map. For each
held skill, gather co-occurring skills; rank a suggestion by **SUM(npmi) across all
held skills** (breadth × strength). Summing beats conditional P(b|held) because P
inflates for rare held skills (one low-df skill like FFmpeg → P(C++|FFmpeg) huge off
a single vacancy → hijacks the list); summing favors skills many of your skills point
to. Guards: `npmi >= 0.1` (real association; also drops substitutes + negatively-linked
pairs), exclude `node_tech_meta.generic` (Docker/CI/CD/Git noise), exclude already-held,
VERIFIED SKILL only, cap 8. Reason = the strongest single link. Real-data smoke: a
senior full-stack CV yields React Native / WebSockets / JavaScript / MySQL / FastAPI /
Redis (each backed by 10–18 held skills) — no niche noise.

- **No `skill_source` column (no migration).** Confirmed skills are plain
  `candidate_nodes` rows (counted by matching, auto-excluded from future suggestions).
  Extracted-vs-confirmed *visual* marker deferred to v1.1 with the column.

**Shipped:** `AdditionalSkillsService` (co-occurrence query) · `GET /cv/:id/skill-suggestions`
· `POST /cv/:id/skills` (`CandidateLoaderService.confirmSkill`, **rejects sample
candidates**) · web: `cvApi.skillSuggestions`/`confirmSkill`, auto-triggered chips in
`CandidateProfile` (tooltip reason, optimistic add, `["match", candidateId]`
invalidation), **gated off for samples**. Verified: etl+web build green, real-data
smoke over two candidates. Not yet exercised: live HTTP round-trip.

## v1.1 — reject + manage (2026-07-11)

Expanded from confirm-only to full management (still migration-free):
- **reject** a suggestion → `POST /cv/:id/skills/reject`; stored in
  `candidates.extracted.rejectedSkillIds` (a rejected skill isn't held, so it must
  NOT go in candidate_nodes), excluded from future suggestions. × on the feed chips.
- **remove** a skill → `DELETE /cv/:id/skills/:nodeId`.
- **/me skill manager** (`me/_components/CvSkillManager.tsx`): current skills
  (removable), search-to-add over the public `/feed/skills` catalog, and
  suggestions inline (confirm/reject). Add/remove invalidate `["match", candidateId]`.
- **more** suggestions: cap 8 → 12.
- **slug↔uuid fix:** `/feed/skills` returns node ids as *slugs* (all verified skills
  have one), but suggestions/matched use UUIDs. So the CV skill endpoints resolve
  the ref via `NodeSlugResolver.toId("SKILL", ref)` (maps slugs, passes UUIDs
  through) instead of `parseRequiredUuid` — otherwise search-add 400s.
- All mutations still reject `sample` candidates.

## v1.2 — per-CV manager + English copy (2026-07-11)

Live-use feedback on v1.1 surfaced two problems:

- **"active CV" was the wrong scope for the manager.** Gating the `/me` skill
  manager to `MeCv.isActive` (falling back to `cvs[0]`) meant a freshly-added CV
  that wasn't (yet) the active one couldn't be managed at all from `/me` — picking
  it wasn't possible, so edits silently landed on the wrong candidate. Fixed:
  `MyCvPanel`'s `CvRow` now carries its own "manage skills" toggle per row,
  expanding an inline `CvSkillManager` scoped to that row's `candidateId` — no
  dependency on which CV is flagged active.
- **Suggestion copy was Ukrainian, everywhere else in the consumer product is
  English** (only the `(investigation)` admin views are Ukrainian — confirmed by
  grepping the app for Cyrillic). `CandidateProfile`'s suggestion label, tooltip
  reason, and error toasts were converted to English to match.

## Risks

- **False "you know X"** — the core founder concern. Mitigated structurally:
  asymmetric prerequisite-only, VERIFIED-only, user confirm-gate, and
  co-occurrence explicitly excluded from v1.
- **Symmetric co-occurrence misused as implication** — the single biggest
  temptation; v1 forbids it in the design, not just in tuning.
- **`node_tech_meta` coverage gaps** — NEW/unclassified held skills yield no
  suggestion (safe no-op; same property as ADR-0010).
- **Stack primary-language ambiguity** — JS vs TS across `frontend`/`node`
  stacks; relies on the same `lang_stacks` assumption learn-next already trusts.
  Bounded blast radius (suggestions are confirm-gated).
- **Confirmation loss on edited-CV re-upload** — content-hash keying means an
  edited CV is a new candidate. Noted, deferred to the auth/account work.
