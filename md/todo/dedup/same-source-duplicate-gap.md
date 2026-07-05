# Same-source duplicates leak into CV digests — findings + fix

> **Status:** FIXED in code on branch `feat/dedup-mechanics-collapse` (2026-07-05).
> Both gaps closed + window widened; **needs a one-time prod backfill** (see below)
> for existing frozen groups. Move to `_done/` after merge + backfill.
> **Trigger:** a "за резюме" Telegram digest delivered two near-identical Geniusee/DOU
> postings as "2 нових".

## Fix applied (branch `feat/dedup-mechanics-collapse`)

- **Gap 1 (Fix B):** dropped `cand.source_id != v.sourceId` in `dedup.service.ts` —
  same-source reposts now merge. Kept the 0.92 pairwise+centroid thresholds and
  role/seniority/company gates, so precision holds (prod snapshot: 860 same-source
  pairs at ≥0.92 with all gates passing become recoverable).
- **Gap 2 (Fix A):** the CV/ranking path (`ranking.service.ts` `rankByRefs`) now
  collapses each dedup group to one representative (best-ranked member) via a
  `row_number()` partition. The feed (`feed.service.ts`) collapses **every** group
  (gold and confirmed alike) to its **freshest** member — previously only all-gold
  groups collapsed. Both digest paths (`feed.search` filter subs, `rankByRefs` CV
  subs) are now covered.
- **Window:** `PREFILTER_DATE_WINDOW_DAYS` 14 → 45 — the audit's single biggest
  recall gap (bump-drift froze pairs out of the ±14d window; Pair B recovers).
- **Not in scope (needs the two-tier LLM confirm tier):** sub-0.92 true dups like
  Pair A (0.879) and the ~19% gate-blocked pairs. Kept the hard gates intact.
- **Backfill (run once on prod after deploy):** `pnpm dedup:reset && pnpm dedup:resolve`
  — embeddings are already 100%; re-resolve rebuilds all groups under the new rules
  and unfreezes existing pairs (e.g. Pair B). Steady-state 5-min sweep needs nothing.
- **Known follow-up (not this branch):** cross-run digest suppression is still by
  vacancy id, so an already-notified group can re-surface via a different member on a
  later run. In-digest duplication (the reported symptom) is fixed.

---

## Symptom

A CV subscription notified `2 нових` where both cards were the same job:

| | Card 1 | Card 2 |
|---|---|---|
| title | Middle **strong** Node.js Developer в Geniusee | Middle Node.js Developer в Geniusee |
| vacancy id | `1f33ba31-c64a-4b23-9cdb-efc60b1f3f08` | `a8a4f653-8e5a-4c17-bd15-d5765c41c9a3` |
| source | DOU | DOU |
| company | Geniusee | Geniusee |
| role / seniority / format | Backend / MIDDLE / REMOTE | Backend / MIDDLE / REMOTE |
| external_id | 364340 | 364351 |
| published | 10:07 | 10:37 (30 min later) |
| unique_vacancy_id | `9ed3c437…` (solo) | `336a5e58…` (solo) |
| dedup_reason | NULL | NULL |

Embedding **cosine similarity = 0.979** — above the merge threshold (0.92) and the
gold threshold (0.95). Semantically identical, yet each is its own solo group and
neither was ever merged.

---

## Root cause — two independent gaps, both apply here

### Gap 1 — dedup only compares *across* sources

`apps/etl/src/02-enrich/dedup/dedup.service.ts:319` — the candidate query has:

```sql
AND cand.source_id != ${v.sourceId}
```

Both postings are DOU, so they are never offered to each other as merge candidates
and the 0.979 similarity is never computed. Same-source duplicates are structurally
out of scope: the "unique vacancy" concept was designed for "same job on Djinni
**and** DOU". One company posting twice on one board falls straight through.

### Gap 2 — the CV/ranking path doesn't collapse dedup groups at all

The gold-collapse predicate (drop non-canonical members of a merged group) lives
**only** in `apps/etl/src/03-discovery/feed/feed.service.ts:443-453` (`buildWhere`).

CV subs go a different route: `subscription-matcher.service.ts` → `ranking.rankByRefs`
→ `ranking.service.ts:buildFilters` (line 353). That path never joins
`unique_vacancies` and never drops non-canonical members. So **even a correctly
merged cross-source gold group would still emit both cards** in a CV digest.

Filter-based subs go through `feed.search` and *do* collapse — CV subs are the leaky
path.

For this notification **both** gaps apply: the two postings are in separate groups
(Gap 1) *and* the CV path wouldn't collapse them even if merged (Gap 2).

---

## Scope (prod, last 30 days)

Same-source clusters = same `source_id + company_id + role_node_id + seniority`,
>1 posting:

- **397** clusters covering **1019** vacancies → **622 redundant extra cards**.
- For comparison, dedup currently catches **371** cross-source groups total.

Same-source duplication is roughly as large as the problem dedup already solves.

---

## Fix

Both are needed for this case to collapse to one card.

### Fix A — make the CV path collapse groups (Gap 2)

Either add the gold-collapse predicate to the ranking query, or (lighter, KISS)
post-filter in `matchByCv`/`buildItems`: collapse ranked items by `uniqueVacancyId`,
keeping the top-ranked member. Independently stops cross-source gold dupes from being
double-notified today.

### Fix B — let same-source pairs into the resolver (Gap 1, root cause)

Drop/relax `cand.source_id != v.sourceId` in `dedup.service.ts`. Safe because the
existing gates stay in force:

- role must match, seniority must match (null-permissive);
- negative-company gate splits different companies;
- 0.92 pairwise **AND** 0.92 centroid thresholds still apply.

A same-source merge then requires *same company + same role + same seniority + ≥0.92
similarity* — exactly the Geniusee case. Caveat: `source_count` stays 1 for such
groups, so they correctly stay out of "cross-source"/metrics views — no change needed
there.

**Recommended order:** A first (smaller, independently useful), then B.

### Open judgment call

"Middle" vs "Middle strong" *could* be two real openings (adjacent seniority bands)
rather than a repost. Both classify as MIDDLE in our data, and for a job-seeker digest
showing both is noise either way. If we want to be conservative, gate same-source
merges to the gold tier (≥0.95) only.

---

## Related

- Brief: [`dedup-brief.md`](dedup-brief.md)
- Tracker: [`../../journal/migrations/semantic-dedup.md`](../../journal/migrations/semantic-dedup.md)
- Notifications tracker: [`../../journal/migrations/tg-notifications.md`](../../journal/migrations/tg-notifications.md)
