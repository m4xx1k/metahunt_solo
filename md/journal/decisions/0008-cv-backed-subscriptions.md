# ADR-0008 — CV-backed Telegram subscriptions rank via the reverse-ATS engine

**Status:** accepted
**Date:** 2026-06-23
**Context (in time):** Stage 07 — sits atop `reverse-ats` (ADR-0006) + `tg-notifications`
**Branch:** `feat/cv-subscriptions`

## Context

Two systems already exist independently:

- **reverse-ATS** (ADR-0006): upload a CV → `rankByRefs` ranks vacancies by
  IDF-weighted skill fit (STRONG/GOOD/STRETCH tiers). A read path only.
- **Telegram subscriptions** (`tg-notifications`): a saved feed query +
  Telegram chat; a scheduled digest replays the query through
  `FeedService.search` and pushes new, unsent matches.

Users want to subscribe to new vacancies **by their resume** (plus filters like
seniority, бронь, remote). The subscription/digest path matches by boolean feed
filter; the reverse-ATS path matches by CV ranking. The gap is purely the
bridge between them.

## Options

### Option A — Snapshot the CV's matched skill ids into `params.skillIds`
- ✅ zero engine change — the digest already handles `skillIds`
- ❌ feed `skillIds` is **AND** — a 15-skill CV matches almost nothing
- ❌ loses the fit tier entirely; a notification is just "contains skill X"
- ❌ contradicts ADR-0006 (skills are a ranking signal, not a filter)

### Option B — Store a `candidate_id`; the digest ranks via `rankByRefs`
- ✅ same quality as the reverse-ATS page (IDF fit tiers, gap-aware)
- ✅ reuses all the subscription machinery (deep-link, `/start`, anti-join)
- ✅ honours ADR-0006 end to end
- ❌ needs `rankByRefs` to support the digest's new-since/anti-join window
- ❌ a second subscription flavour to keep coherent

## Decision

**Option B.** A subscription gains a nullable `candidate_id`, which
**discriminates the flavour**:

- `candidate_id = null` → **filter sub**: `params` is a feed query; digest
  matches via `FeedService.search` (unchanged).
- `candidate_id` set → **CV sub**: `params` holds the reverse-ATS match filters;
  digest ranks via `RankingService.rankByRefs`, gated to **STRONG+GOOD** by
  default (overridable per-sub via `minFitTier`).

`DigestService.matchNew` dispatches on `candidate_id` into two named private
matchers (`matchByCv` / `matchByFilters`) — no inline flag soup. Matching is
decoupled from delivery (it no longer needs the chat), which also enables a
no-send preview.

The two enabling seams:

- **`rankByRefs` windowing:** added `loadedAfter` + `excludeIds` to
  `MatchFilters`, applied as result-narrowing conditions in the final WHERE.
  Purely additive — the page UI never sets them, so its behaviour is unchanged.
- **`params` as a typed bag:** the contract splits `FEED_PARAM_KEYS` from
  `CV_MATCH_PARAM_KEYS` (whitelist = their union) and a pure
  `paramsToMatchFilters` mapper, so the two shapes are documented, not smuggled.

## Consequences

- A CV sub stores only a `candidate_id` reference, not resume text — but it does
  pin a candidate row indefinitely (PII retention is a follow-up, not v1).
- If the candidate is deleted, `getMatchInput` throws; the per-sub delivery
  try/catch isolates it (a repeated-failure auto-deactivate is a follow-up).
- The single web `subscriptionsApi.create(params, candidateId?)` fetcher now
  serves both flavours, and the digest already branches on `candidate_id` — so
  the planned **feed + reverse-ATS page merge** needs no further backend change.
- Filter subs use single enums (`seniority`); CV subs use arrays
  (`seniorities`). The merge will want to settle on arrays (a superset).

## Follow-ups

- Surface the fit tier inside the Telegram digest card.
- Auto-deactivate a CV sub whose candidate is gone after N failures.
- CV retention / delete-my-data.
