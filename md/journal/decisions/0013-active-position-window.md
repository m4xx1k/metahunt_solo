# ADR-0013 — Freshness is a query filter, not a stored state

**Status:** proposed (supersedes the `active`-window draft of the same number)
**Date:** 2026-08-07
**Context (in time):** sibling of ADR-0012; both land in `feat/canonical-vacancy-grain`
**Branch:** `feat/canonical-vacancy-grain`

## Context

The schema has no expiry concept, and sources do not reliably signal closure — absence from one poll is
not proof, it may be a failed fetch. `MarketService.getAggregates` counts the entire corpus, while the
landing prints that number under the caption "· 30 днів" (`apps/web/app/match/page.tsx`), which is copy,
not a filter.

Measured on production, eligible rows only: 14 751 postings / **12 448** positions all-time, against
**4 986** positions in the last 30 days. Corpus spans 2026-05-01 → 2026-08-07.

The first draft of this ADR treated that gap as a wrong number and proposed a global `active` predicate.
That was the wrong diagnosis. The corpus count is a legitimate statement — *this is what metahunt has
seen* — and every listing in it contributed to the market picture, whether or not it is still open. The
caption is what lies, not the number.

A stored `active` flag or a hardcoded global window would also freeze one interpretation of freshness
into the model, when freshness is exactly the dimension we want to slice by later.

## Options

### A — Global `active` predicate applied everywhere (the superseded draft)

- ✅ One number, no ambiguity.
- ❌ Bakes "30 days" into the model; changing it becomes a migration-shaped conversation.
- ❌ Discards the corpus statement, which is a real and useful thing to say.
- ❌ Blocks the data lab from asking time-sliced questions without fighting a global filter.

### B — Freshness as a filter parameter, corpus count kept and relabelled

- ✅ No new concept in the model. The predicate already exists as `FeedSearchParams.postedWithinDays`.
- ✅ Any window is expressible per query — the data lab slices freely, the user can widen or drop it.
- ✅ The landing keeps its "here is the market metahunt sees" statement, honestly captioned.
- ❌ Two numbers now exist on the product (corpus vs filtered result), and they must be labelled so
  they never read as a contradiction.

### C — Stored closure detection from source absence

- ✅ The only option that answers "is this job still open".
- ❌ Needs per-source poll-completeness guarantees and a confirmation window. Real work, and it needs a
  new stored fact (`last_seen_in_feed_at`), not a reinterpretation of what we already have.

## Decision

**Option B.** Freshness is a **predicate**, not a state. Nothing in the schema decides what "fresh"
means; queries do.

- No `active` column, no `ACTIVE_POSITION` constant, no global window.
- `first_published_at` / `last_published_at` roll up onto `unique_vacancies` (ADR-0012) as **facts**
  about a group, not judgments — they are what any window predicate or time series is computed from.
- The existing `postedWithinDays` predicate is promoted from a sitemap-internal parameter to a
  first-class, user-visible feed filter, and re-pointed at the group's `last_published_at` instead of
  the posting's own timestamp. Feed default: 30 days, shown as a removable chip, not a hidden constraint.
- The market aggregate stays all-time and says so plainly — **"12 448 вакансій у базі"** — rather than
  the current false "30 днів". SEO surfaces (role hubs, sitemap) also stay all-time.

Governing rule, which is the part worth keeping if everything else changes: **every number displays the
scope it was computed under — unit, window, and `as_of`.** A number and its caption ship together.

Option C is deferred, not rejected. When it arrives it adds a column and marks positions; it does not
re-open this decision.

## Consequences

- Zero model complexity added for freshness. The one thing that was already there (`postedWithinDays`)
  gets exposed instead of a new concept being introduced.
- Two numbers coexist by design: the corpus statement on the landing and the filtered result count in
  the feed. They will differ, and that is correct — but only if both carry their scope. Unlabelled, this
  recreates exactly the header-vs-list confusion ADR-0012 exists to fix.
- The corpus grows with the project, so "у базі" describes a widening set over time. Owner's call, taken
  knowingly: the sentence stays true, it just says less as months accumulate. Real closure detection is
  what eventually makes it mean something again, and that is deferred on purpose.
- Distributions (seniority, work format) on the landing are all-time too, and inherit the same caption.
- Date sorting must use the group's `last_published_at`, not the representative's own timestamp, or
  reposts sort inconsistently with the window that filtered them.
- Sets up the data lab: valid-time (`published_at`) rollups per position are exactly what trend work
  needs, and no global filter stands in its way.
