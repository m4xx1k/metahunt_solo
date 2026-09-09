# Digest time axis → bump-aware, + `rankByRefs` retirement

Branch: `fix/digest-bump-axis`. Two commits, shippable as one PR. No Linear id
yet — link the user-interview issue ("too few vacancies vs Djinni") when found.

**Outcome (commit 1, 2026-09-09):** shipped — `buildWhere` now matches on
`last_source_activity_at`, the anti-join bounds on `sent_notifications.sent_at`
(N days, `DIGEST_RESEND_LOOKBACK_DAYS`, optional env, default `1`), rename to
`activeAfter` done everywhere. Prod read-only count over the 14 d window:
**2430** Positions bump-aware vs **1325** first-load-only — subscribers were
missing ~45% of what the bump-aware axis surfaces. Commit 2 (`rankByRefs`
retirement) is intentionally deferred, not started.

## Problem

The Telegram digest decides "new since X" on `positions.first_observed_at` —
the first time *we* loaded the Position
([`feed.service.ts:704`](../../apps/etl/src/03-discovery/feed/feed.service.ts),
`if (params.loadedAfter) conds.push(sql\`p.first_observed_at > ${params.loadedAfter}\`)`).
A Djinni/DOU recruiter "bump" (re-date a live listing so it floats to the top)
moves `published_at`, not our load time, so a bumped listing never re-enters
the digest window. Subscribers see fewer arrivals than the same filter shows on
Djinni. The DB already has the bump-aware axis — `positions.last_source_activity_at`
(= `unique_vacancies.last_seen_at` = `MAX(published_at, loaded_at)` over the
group) — and the bump pipeline is already wired (re-dated RSS item → new hash →
loader updates `vacancies.published_at` → `repairUniqueVacancy` recomputes
`last_seen_at`). Only the digest's inclusion predicate ignores it.

`first_observed_at` stays the axis for trends / `track_counts` / homepage
velocity — that is a deliberate bump-proof choice
([ADR-0012](../journal/decisions/0012-position-grain-and-dedup-state.md),
MET-142). This change moves **only the digest**, which wants exactly the
"good liveness signal" ADR-0012 sets aside.

Second, `RankingService.rankByRefs` + `CandidateMatchService` were scheduled
for deletion in "step 9" of the unified-feed-score rework
([`unified-feed-score-step8-merge.md#2`](unified-feed-score-step8-merge.md))
and survive only because the CV digest still calls them. Commit 1 opens that
code path anyway; commit 2 finishes step 9.

---

## Commit 1 — `feat(digest): match on source bump time, not first-load time`

**1a. Predicate.** In `buildWhere`
([`feed.service.ts:704`](../../apps/etl/src/03-discovery/feed/feed.service.ts))
change `p.first_observed_at` → `p.last_source_activity_at`. Rename
`FeedSearchParams.loadedAfter` → `activeAfter` for honesty; it is only set by
the two digest paths (filter subs via `subscription-matcher`, CV subs via
`MatchFilters.loadedAfter` → `ranking.service.ts:181`), never by the web feed,
so the rename is contained to: `feed.service.ts` (type + `buildWhere` +
`:86-87` comment), `cv/candidate-match.service.ts:31,74`,
`ranking/ranking.contract.ts:76` + `ranking.service.ts:181` (both vanish if
commit 2 lands first), `04-notify/telegram/subscription-matcher.service.ts:57-114`
(+ log line `:80`).

**1b. Anti-join fix — do not skip, this is a correctness bug.**
`sentVacancyIds` / `sentVacancyIdsForChat`
([`sent-notifications.service.ts:43-70`](../../apps/etl/src/04-notify/telegram/sent-notifications.service.ts))
bound the "already sent" list by `vacancies.loaded_at > floor`. With bump-time
candidacy, a Position loaded 30 d ago but bumped yesterday is a fresh candidate
while its sent record (joined through a vacancy loaded 30 d ago) falls outside
that bound → the digest re-sends it, every run, for the whole 14 d scan window
(the `sent_notifications` PK stops a dup row, not a dup Telegram message).
Fix: bound by `sent_notifications.sent_at > now() - make_interval(days => N)`
instead; drop the `JOIN vacancies` from both methods (the chat method keeps its
`JOIN subscriptions` for `chat_id`). `sent_at` already exists with `defaultNow()`
([`schema/sent-notifications.ts:18`](../../libs/database/src/schema/sent-notifications.ts)).
`N` is a product knob — **owner's call** (see Q4 below); low N = a re-bump
re-notifies sooner, high N = a listing notifies at most once per N days no
matter how often it is bumped.

**1c. Scan window untouched.** `SCAN_WINDOW_DAYS = 14` and `candidateFloor()`
([`subscription-matcher.service.ts:27,137-140`](../../apps/etl/src/04-notify/telegram/subscription-matcher.service.ts))
stay — still the perf floor and the "never notify about pre-subscription
vacancies" floor, now read against bump time. Leave the `first_observed_at`
view column in place (trends need it); add a one-line note in the `positions`
schema comment that the digest no longer reads it.

**1d. Tests + verify.** `subscription-matcher.service.spec.ts`,
`digest.service.spec.ts`: add cases — Position first-observed before
`createdAt` but bumped after it → appears in `matchNew`; same Position in
`sent_notifications` within N d → excluded; older than N d → re-sent once.
Prod read-only (`scripts/prod-db-url.sh`): for one live subscription's filter,
`count(*)` with `last_source_activity_at` in last 14 d vs `first_observed_at`
in last 14 d — the delta is what subscribers were missing; put it in the PR
body. Run `pnpm test:etl`, `pnpm test:etl:int`, `pnpm build:all`. Pause the
`tg-digest-daytime` schedule around any prod migration (CLAUDE.md §2).

---

## Commit 2 — `refactor(ranking): route CV digest through feed path, drop rankByRefs`

**2a. Move `matchByCv`.** In
[`subscription-matcher.service.ts:100-123`](../../apps/etl/src/04-notify/telegram/subscription-matcher.service.ts)
replace the `CandidateMatchService.match` call with the same composition the
web feed uses: build `FeedSearchParams` (`page:1`, `pageSize:MAX_VACANCIES_PER_RUN`,
`activeAfter`, `excludeIds`, `minFitTier: stored ?? DEFAULT_CV_MIN_FIT`), then
`const { scorer } = await resolveFeedQuery(this.db, candidateId, params)`
([`resolve-feed-query.ts`](../../apps/etl/src/03-discovery/feed/resolve-feed-query.ts))
and `this.feed.search(params, scorer)`. `minFitTier` + a scorer → the
`searchScored` full path, i.e. the same `rankedPage` assembly `rankByRefs`
runs. The service swaps its `CandidateMatchService` inject for `DRIZZLE`
(or a thin `FeedQueryService` wrapper). Rename `paramsToCandidateCriteria` →
`paramsToFeedParams`.

**2b. Keep `match_scored`.** The page-1-sampled coverage histogram + tier
counts fire from `emitMatchScored`
([`ranking.service.ts:216-256`](../../apps/etl/src/03-discovery/ranking/ranking.service.ts)),
which goes away with `rankByRefs`. Relocate into `FeedService.searchScored` or
drop it deliberately with a note here — **owner's call** (Q2). It is the §8
scoring-threshold calibration feed; do not lose it silently.

**2c. Delete.** Once 2a+2b are green: `RankingService.rankByRefs`, `.match`,
`.buildItems`, `.emitMatchScored` (keep `resolveSkills` / `resolveRole` /
`suggestRoles` — used by `cv.controller`, `candidate-loader`,
`recommendation.service`); `cv/candidate-match.service.ts` + its wiring in
`cv.module.ts:10,18,23`; `ranking.contract.ts` `MatchResponse` / `RankedVacancy`
/ `MatchFilters` (check `MatchSort` / `FitTier` still re-export from
`score.contract`); web `lib/api/ranking.ts` leftover `cvApi` types; grep
`me.contract.ts` for a lingering `CandidateMatchParamsDto`.

**2d. Tests.** `ranking.int.spec.ts` (~6 cases on `RankingService.match`) and
`score.int.spec.ts` (`rankByRefs`): rewrite the scoring-semantics assertions
onto `FeedService.search` with a scorer; delete the ones that only proved the
now-gone glue. Full `pnpm test:etl` + `:int` + `build:all`.

Ordering note: commit 2 depends on commit 1b — it routes the CV digest through
the same predicate, so the re-send bug would land there too without the
anti-join fix.

---

## Questions for the owner (answer inline, then implement)

1. **N (anti-join lookback, 1b).** How many days must pass after a send before
   a re-bumped listing may notify the same user again? Leaning: `1` (owner) vs
   `7` (safer against a source that re-dates on every poll). — `N = 1`, shipped
   as the optional `DIGEST_RESEND_LOOKBACK_DAYS` env (default `1`) so it's a
   one-line change to raise, no redeploy of code.

2. **`match_scored` (2b).** Relocate the event into `FeedService.searchScored`
   (it then also fires for the web full-path — acceptable, just more volume) or
   drop it with a note? — `relocate / drop`

3. **Opt-in toggle.** Ship commit 1 as a pure default swap and defer a
   per-subscription "only brand-new listings" toggle (restores the
   `first_observed_at` predicate) to MET-122? Or build the toggle now? —
   `defer` (shipped as a pure default swap, no toggle).

4. **RSS reality check.** Confirmed that Djinni/DOU actually re-emit a bumped
   listing in the RSS with a fresh `pubDate` (the whole fix rests on it)?
   Quick check: `rss_records` history for a vacancy you know was bumped —
   is there a second row with a later `published_at`? — `confirmed`. Djinni
   [840810](https://djinni.co/jobs/840810-middle-node-js-developer/),
   published Aug 3 / bumped Sep 3: two `rss_records` rows for the same
   `external_id` (`published_at` 2026-08-03 14:32 and 2026-09-03 07:52,
   different `content_fingerprint` too — not a pure re-date, the listing text
   also changed). Downstream propagated correctly: `vacancies.loaded_at`
   stayed 2026-08-03, `vacancies.published_at` moved to 2026-09-03;
   `positions.first_observed_at` stayed 2026-08-03 (bump-proof, correct),
   `positions.last_source_activity_at` moved to 2026-09-03 (the axis the
   digest now reads).

## Risk log

| risk | mitigation |
|---|---|
| A source re-dates its whole feed each poll → digest flood | `SCAN_WINDOW_DAYS` 14 + `MAX_VACANCY_MESSAGES_PER_DIGEST` 6 + MET-6 cap bound the send; anti-join stops repeats within N d; if a `source_code` is pathological, gate the axis per source |
| dedup lag: a 2nd-source copy loaded before dedup merges it → two Positions briefly → possible double send | pre-existing today (fresh singleton also has fresh `first_observed_at`); this change does not worsen it |
| `last_seen_at` uses `MAX(loaded_at)` when `published_at` is null | acceptable — a re-load with no publish date is still source activity |
