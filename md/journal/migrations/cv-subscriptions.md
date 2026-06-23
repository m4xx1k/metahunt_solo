# cv-subscriptions — subscribe to new vacancies by your resume (Telegram)

**Status:** ✅ ready to merge — implemented, etl + web build green, digest unit
tests pass (incl. CV-branch). Pending: manual smoke (recipe below) + merge.
**Branch:** `feat/cv-subscriptions`
**Sits atop:** ADR-0008, reverse-ats (ADR-0006), tg-notifications
**Date:** 2026-06-23

## Goal

On `/reverse-ats`, once a CV is uploaded, let the user subscribe to new matching
vacancies in Telegram — ranked against their resume (not a boolean filter),
carrying the page's filters (seniority, бронь, remote, English, employment, fit
tier, freshness). Reuse the existing subscription + digest machinery; keep the
later feed + reverse-ATS merge cheap.

## Design

See **ADR-0008**. A subscription is CV-backed iff `candidate_id` is set; the
digest dispatches on it (`matchByCv` via `rankByRefs` / `matchByFilters` via
`FeedService.search`). CV subs notify on STRONG+GOOD by default.

## What shipped (by commit)

1. `feat(db)` — `subscriptions.candidate_id` nullable column + migration `0021`.
2. `feat(ranking)` — `MatchFilters.loadedAfter` + `excludeIds`; applied in
   `rankByRefs`'s final WHERE (additive — page behaviour unchanged).
3. `feat(notify)` — contract `FEED_PARAM_KEYS` / `CV_MATCH_PARAM_KEYS`;
   `SubscriptionsService` stores/returns `candidateId`, CV-aware `describe`,
   `getMatchTarget`; controller threads `candidateId`; `CvModule` exports
   `CandidateLoaderService`; `TelegramModule` imports Cv/Ranking modules.
4. `feat(notify)` — `DigestService` CV/filter dispatch + `paramsToMatchFilters`
   mapper + read-only `GET /digest/preview/:id`; digest spec covers both branches.
5. `feat(web)` — `subscriptionsApi.create(params, candidateId?)` + `CvMatchParams`;
   widened analytics seam; `CvSubscribeButton`; wired into `ReverseAtsClient`
   (shown only for a CV source).
6. `docs` — ADR-0008, this tracker, runbook smoke recipe.

## Fast test

`GET /cv/:id/matches` (match quality) + `GET /digest/preview/:id` (digest window,
no send). Local recipe: `.scratch/cv-subscription-smoke.md` (gitignored).

## Follow-ups (out of scope)

- Fit-tier badge inside the Telegram digest card.
- Auto-deactivate a CV sub whose candidate was deleted (after N failures).
- CV retention / delete-my-data.
- Feed + reverse-ATS page merge (this work keeps it cheap; see ADR-0008).
