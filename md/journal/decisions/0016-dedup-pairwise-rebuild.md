# ADR-0016 — Dedup is pair rules plus a deterministic cluster rebuild

**Status:** accepted (rollout pending owner review)
**Date:** 2026-09-25
**Supersedes:** ADR-0012 in two places, dedup *merges* groups, and operator unlinking as `detached_at`

## Context

The resolver walked vacancies in `published_at` order. It glued each one to the best group by
embedding cosine ≥ 0.92 (pairwise and centroid) and never revisited it. The gates were pairwise but
groups are unions, so chains formed. Measured on prod 2026-09-25 (20 557 vacancies): a 28-member
group held 17 distinct QA roles, a Ciklum group held 25 requisition numbers, and 1 459 groups
mixed two different same-board postings. Membership was sticky: an edited vacancy kept its
group. A manual unmerge was erased by the next reset. Title, the strongest identity signal,
never gated a merge. Djinni leaves `company_id` null on 56% of postings, so a `company + title`
key would lose most cross-board recall.

## Options

### A — Keep the incremental resolver, add more gates
- ✅ smallest diff
- ❌ still order-dependent and sticky; every new gate is pairwise, so chains survive; no unmerge

### B — Pair rules + complete-veto clustering, rebuilt from scratch on demand
- ✅ deterministic (same input → same partition); one rule set for the sweep and a full rebuild
- ✅ complete veto (a posting joins only if **no** member forbids it) makes chaining impossible
- ❌ needs a read-only `plan` and an atomic `apply` to roll out without a singleton window

### C — Centroid / tiered thresholds tuned harder
- ❌ centroids track shared boilerplate; tiers were decoration, not decisions

## Decision

**Option B.** Three pure functions and one writer (`apps/etl/src/02-enrich/dedup/`):

- `vetoes(a, b)`: an operator override, companies both known and different, different
  requisition numbers, different seniority, a different role, or two same-board postings of
  different content that are not a repost.
- `isSame(a, b)`: identical content → `exact`; same board, same company, same title key and
  shingle containment ≥ 0.9 → `repost`; other board, title similarity plus text containment or
  cosine → `cross_source`, with a stricter pair when a company is unknown. Links need both
  postings inside ±45 days. Time is never a veto, so a job reposted monthly stays one cluster.
- `buildClusters`: oldest first; a posting joins the strongest linked cluster unless any member
  vetoes it.
- `writePartition`: one transaction; each cluster keeps its oldest member's group id; version
  checks leave a partition built on stale data unwritten.

The 5-minute sweep rebuilds only the affected set (the pending vacancy, its group, and its
candidates' groups). `dedup plan` rebuilds the whole corpus read-only and writes `target.json`
and `current.json`. `dedup apply` writes either one; applying `current.json` is the rollback.

Operator unlinking is a pair table, `dedup_overrides (vacancy_a < vacancy_b, verdict = 'different')`,
not ADR-0012's `detached_at`. A rebuild recomputes every group, so a per-vacancy flag cannot say
*with whom* the posting is not the same job, and it would not survive. A pair verdict is an
ordinary veto that every future rebuild respects.

Embeddings retrieve candidates and supply one text signal; they are never the sole reason for a
merge that title and text disagree with. Thresholds were calibrated on a blind-labelled golden set
under the constraint "zero false merges". Values and curve: `md/journal/migrations/dedup-rebuild.md#decisions`.

## Consequences

- A merge is explainable: `dedup_reason` stores the rule and the three signals it saw.
- Adding a condition is one function plus tests, a golden-set run and a `plan` diff. The clustering
  and the writer never change for a new rule.
- An edited vacancy is split out on its next sweep; a digest may then send it as new. That is correct
  for a real false merge, and it is why the repost rule is mandatory.
- `unique_vacancies.centroid_embedding` is still written (so a code rollback works) but never read.
  `exact_content_conflicts` is no longer written. Both are dropped in a follow-up once prod is verified.
- The sweep compares every pair in the affected set, while `plan` compares ANN top-20 candidates.
  A pair that isSame accepts but that ANN misses can therefore differ between the two. It is rare
  (strong title + text evidence almost always ranks in the top 20), and the next full `plan`
  surfaces it as a diff.
