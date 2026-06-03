# ADR-0006 — Skills are a ranking signal, not a filter (resume-match direction)

**Status:** proposed
**Date:** 2026-06-03
**Context (in time):** Stage 06 → 07 (forward-looking; sits atop `taxonomy-navigation`)

## Context

The taxonomy-navigation work added a skills filter with **AND** semantics (a
vacancy must carry every picked skill). Discussing that surfaced a deeper
question: the planned **resume-match** feature (user uploads a CV → we extract
their skills → show best-fitting vacancies) cannot be expressed as a boolean
filter at all. AND drops a 7/8 match for one missing skill; OR floods with no
ordering. Matching a candidate to jobs is inherently a **ranking** problem, not
a set-membership one. We need to decide the model before building either the
multi-skill picker's final behaviour or the resume flow.

## Options

### Option A — Keep treating skills as a hard filter (AND or OR)
- ✅ trivial, already built (AND)
- ❌ AND over-constrains → empty feeds; OR is too loose to be useful
- ❌ can't express "best match" — there is no ordering, only in/out

### Option B — Split hard filters from soft ranking; skills become weighted signals
- ✅ matches how job search actually works: constraints narrow, relevance orders
- ✅ resume-match is then just "score every vacancy in the filtered set"
- ✅ composes cleanly with tracks (track narrows the universe → resume ranks it)
- ❌ harder to communicate a score than a yes/no filter (the main cost)

## Decision

**Option B.** Two distinct layers:

- **Hard filters** (boolean, AND): track/role, seniority, format, salary,
  location — dealbreakers that define the candidate *set*.
- **Soft signals** (ranking): skill overlap and friends — order results
  *within* that set. Skills move from predicate to **weight**.

The metahunt-specific enabler: vacancies and resumes can share **one canonical
skill-node taxonomy**. The same BAML extractor + node resolver that pulls skills
from a vacancy processes a resume into the *same* `node_id` set. Matching is then
a set operation over `vacancy_nodes` — cheap on ~3.6k vacancies, computable on
the fly, and **explainable** (we can point at exactly which skill nodes matched).

Scoring (v1, explicit nodes — no embeddings):

```
score(v) = Σ weight(s)        for s ∈ candidateSkills ∩ skills(v)
weight(s) = log(N / df(s))    // IDF: rare skill weighs more; ubiquitous ≈ 0
```

IDF makes the parked `is_generic` problem (git/english/scrum noise — see
`taxonomy-navigation.md` "Still open") **self-solving**: a match on `git` weighs
almost nothing, a match on `Rust` weighs a lot. No manual blacklist needed.

Surface two honest metrics, not one fake percentage:
- **Fit / coverage** = `|have ∩ required(v)| / |required(v)|` → "am I qualified?"
- **Relevance** = Σ weights of matches → "does it use my strengths?"

Sort by relevance, tier by fit.

We trade away the simplicity of a yes/no filter: a score must be *explained* or
it reads as a black box. That cost is paid in UX (below), not in the model.

## Communicating it to the user

Black-box scores erode trust; the explanation is half the feature.

- **Tiers, not precise %**: "Strong / Good / Stretch", not "87.3%".
- **Skill-diff on the card**: ✅ have · ❌ missing (`Kafka, Spark`) · ➕ bonus
  (your skills they don't even ask for) — makes the score transparent + actionable.
- **Sort toggle**: "Best match" (default after resume) vs "Newest".
- **Growth framing, not rejection**: "2 skills from a full match", never "you
  don't qualify".
- **Hard filters stay visible and separate** from the match score, so the user
  knows what *cuts* vs what *orders*.

## What this means for AND/OR right now

- Keep **AND** for manually-picked skills as an explicit, secondary "must-have
  stack" power-tool. It is a hard filter and that's fine.
- The *primary* skill interaction and the whole resume flow are **ranking**, not
  filtering. Optionally unify later: a picked skill defaults to "preferred"
  (boosts rank); long-press / toggle promotes it to "must" (hard AND).
- **Near-term, cheap fix (do first):** a **live result total** in the header that
  updates on every filter change, so an empty feed reads as "I over-narrowed",
  not "broken". Per-option faceted counts ("SQL (180) · Spark (12)") are a
  later, costlier nicety.

## Consequences

- **Enables** resume-match as a ranking pass over the existing filtered set — no
  new matching engine, just a score + sort + diff over shared skill nodes.
- **Sets up** reuse of the extraction/resolution pipeline for resumes (symmetry
  with vacancy ingestion) and retires the `is_generic` blacklist idea in favour
  of IDF weighting.
- **Pays** an ongoing UX cost: every score needs an explanation surface.
- **Blocks nothing** in taxonomy-navigation — this is a layer on top; tracks and
  hard filters are unchanged.
- **Deferred / open:** embedding similarity (resume↔vacancy text) as a *second*
  signal for synonyms/adjacent skills — only if explicit-node matching proves too
  brittle; explainability stays anchored on explicit nodes. Whether resume-match
  is a separate mode or fuses with manual filters — open.
