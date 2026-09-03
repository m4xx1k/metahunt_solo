# Unified feed ⊕ score — step 7 (continued)

**Status:** step 7 code-complete on `feat/met-144-unified-feed-score`, not merged.
**Follows:** [`unified-feed-score.md`](unified-feed-score.md) §7 "Item-id equivalence —
PROVEN, 70/70" — read that file first for §1–§8 and steps 1–6.
**Date:** 2026-09-03

Picks up where the parent file's step 7 left off: the web-side collapse and the `?cv`
removal, done as one session with a deliberate refactor pass first.

---

## 0. A refactor pass before step 7, on the owner's request

Before touching step 7, the owner flagged the branch as "переускладнена" (over-complicated)
and asked for a cleanup: `scorer.port.ts` had grown three near-duplicate pairs (a
`candidateId`-based wrapper next to a resolved-input primitive, each doing the same DB read
twice across `feed.controller.ts`'s `search()` and `vacancy()`), `fragments()`'s five SQL
fragments were assembled into an identical ~60-line page query by both
`RankingService.rankByRefs` and `FeedService.searchScored`, `searchCheap`/`searchScored`
shared an identical hydrate tail, and the vacancy-detail skill diff had three
implementations (server-weighted, server-unweighted, client-counts-only) for one
have/missing/bonus computation. Four commits, each gated (lint · test:etl · tsc · build),
net **−205 lines** before step 7 started:

1. **`refactor(score): one resolveViewer`** — `overlayFor`/`overlayForUser`,
   `resolveCandidateSkills`/`resolveViewerSkills`, `scorerForNodeIds`/`createCandidateScorer`
   collapsed to one `resolveViewer(db, candidateId) -> Viewer | null` (`{nodeIds, skills}`).
   `feed.controller.ts`'s `withMatch()` resolved the same user's active CV twice per
   request (once via each wrapper) — now once. 9 exports → 6.
2. **`refactor(score): one rankedPage`** — new `score/ranked-page.ts:rankedPage()` is the
   shared full-path page-query assembly (`ranked_positions` CTE, windowed
   total/offStackHidden, empty-page fallback count) that `rankByRefs` and `searchScored`
   both hand-built. Same emitted SQL text (fragment order unchanged) — the step-4/5
   byte-diff harnesses stay valid with no fresh capture.
3. **`refactor(feed): one hydrate()`** — `FeedService.searchCheap`/`searchScored` shared
   tail (`selectPositions` + `fetchSkills` → `VacancyDto[]` with `match` attached) folded
   into one `hydrate()`; `overlay` is a `Promise` so the cheap path's
   `scorer.overlayFor(pageIds)` still runs concurrently with the other two fetches.
4. **`refactor(vacancy): one skill-diff, computed client-side`** — dropped
   `feed.controller.ts`'s `buildSkillDiff`/`VacancySkillDiff`; `GET /feed/vacancy/:id` now
   ships `viewerSkills` (same field `GET /feed` already ships per page) instead of a
   pre-built `diff`. New `entities/vacancy/skill-diff.ts:skillDiff()` is the one client
   implementation — `FitPanel` uses the full have/missing/bonus lists, `LabColdCard` takes
   `.length`. `entities/` had no jest `testMatch` glob before this (no prior specs there);
   added one.

`RankedVacancy`/`MatchResponse` (the warm lens's own richer shape — per-item
`matchedRequired`/`requiredTotal`, `breakdown.signals`, a weighted diff) were **not**
touched here — see §2 below for why they turned out not to need touching either.

---

## 1. Also fixed: the "one active CV" invariant wasn't real

Auditing `resolveActiveCandidateId` (`.limit(1)`, no `ORDER BY`) surfaced a real,
independent bug while scoping the `?cv=` removal: `user_cvs`' own schema comment says
*"replace = new row + old isActive=false"*, but neither upload path
(`CandidateLoaderService.loadForUser`, fresh insert or content-hash reuse) ever flipped a
prior CV's `isActive` off. A user with two "active" CVs got scored against whichever row
postgres happened to return first — latent while `?cv=` was in the URL (the caller always
said which CV to rank against explicitly), but load-bearing the moment `?cv=` disappears,
since `GET /feed`'s JWT-resolved active CV becomes the *only* signal.

Fixed with one CASE-atomic UPDATE
(`is_active = candidate_id = :target`), `CandidateLoaderService.setActiveCv()`, called
after every write to `user_cvs.isActive`. The same primitive backs a new
`MeService.activateCv(userId, id)` / `PATCH /me/cv/:id/activate` — what the CV switcher
calls now that there's no `?cv=` to encode a pick in. Integration-tested
(`candidate-loader.int.spec.ts`, `me.int.spec.ts`) — **not run against a live DB this
session** (no docker in this sandbox); run `pnpm test:etl:int` before merge.

Also: `GET /cv/:id` moved from unconditional `JwtAuthGuard` to `@Public()` +
`OptionalAuthGuard` (`assertAccessibleCandidate` widened to `userId: string | undefined`)
— an anonymous visitor previewing a sample CV on the feed can now read its profile
(needed for §3's `unmatched` source), same boundary the sample match/role-suggestion
routes already had, just resolved per-request instead of unconditionally.

---

## 2. Step 7's actual shape: an adapter, not a UI collapse

The parent file's step 7 plan was *"collapse `use-results.ts` to one branch/type"* — delete
`RankedVacancy`/`MatchResponse` and move `WarmBody`/`WarmCard`/`CandidateProfile` onto the
same `VacancyDto.match` + `viewerSkills` shape the cold/lab cards use. That is not what
shipped. Deliberately not: `RankedVacancy` carries real data the unified `MatchOverlay` does
not — `fit.matchedRequired`/`.requiredTotal` (the pip strip), `breakdown.signals` (the
tooltip), and the weighted diff — and rewriting three live, complex components
(`WarmBody`, `WarmCard`, `CandidateProfile`) on a **production, unindexed-nowhere, no
headless-browser-in-this-sandbox** surface to chase that parity was judged higher risk than
it was worth, for a page the owner still gets to look at before merge.

**What shipped instead:** keep every warm-lens UI component byte-for-byte, swap only what
feeds them.

- `features/vacancy-filters/warm-query.ts:fetchMatch()` now calls the unified
  `GET /feed` — no candidate param for a real CV (JWT resolves it), `?sample=<id>` for a
  sample — instead of `/ranking/match` / `/cv/:id/matches` / `/cv/samples/:id/matches`.
- New `features/vacancy-filters/to-match-response.ts:toMatchResponse()` reshapes the
  response back into `MatchResponse`: `fit.matchedRequired`/`.requiredTotal` and the diff
  come from `skillDiff()` (§0.4) against `vacancy.skills` + `viewerSkills`;
  `breakdown.signals` is reconstructed as the same single `skill-overlap` signal
  `buildScoreBreakdown()` builds server-side (weight 1, since that's still the only live
  signal). `resolved.matched` carries `weight: 0` — real IDF weight is gone from every
  client-visible skill list since §0.4, `CandidateProfile`'s "rarest first" sort degrades to
  insertion order, same trade-off already accepted there.
- `unmatched` isn't on the feed response at all (a candidate's own extraction gap, not a
  per-vacancy thing) — `fetchMatch` pulls it from a concurrent `GET /cv/:id` call, which
  doubles as the staleness check `/cv/:id/matches`'s 404 used to be: a `candidateId` stale
  past its CV's deletion still 404s the same way, so `useFeedWarm`'s existing `notFound`
  handling needed no code change.

Net effect: `RankedVacancy`/`MatchResponse`/`SkillRef` types stay (the warm UI still speaks
them); `rankingApi.match` (zero callers even before this), `cvApi.matches`,
`cvApi.sampleMatches`, `CvMatchQuery`, `MatchBody` are dead and deleted.

**Consequence for step 8:** the legacy endpoints (`POST /ranking/match`,
`GET /cv/:id/matches`, `GET /cv/samples/:id/matches`) now have zero client callers, same
end state the original plan wanted — just reached by adapting the client instead of deleting
`RankingService`'s richer response shape. `RankingService`/`RankedVacancy` itself is **not**
dead code yet — nothing in this repo calls `rankByRefs` except those three routes, so step 8
(delete the routes) makes it so, whenever that's decided to be safe. Don't delete
`RankingService` before step 8; do delete the three routes + `RankByRefs`'s callers together
once step 8 actually happens.

---

## 3. `?cv=` is gone

Both routes:

- **`/feed` (lab).** The warm branch had no reachable UI — the only control that ever set
  `?cv` was "try `<sample>`", which always resolved `isSample: true` and took the unified
  cold path already; the branch only fired for a hand-typed `?cv=<real-id>` URL. Deleted:
  `LabWarmCard.tsx`, the `lens`/`isSample` split in `FeedLabShell.tsx`, the `?cv=` fallback
  in `app/feed/page.tsx`'s SSR seed. `?sample=` (renamed from `?cv=`) is the only viewer
  concept left; `FilterRail` gets a literal `lens="cold"`.
- **`/` (production, `(feed)/[[...slug]]/page.tsx` + `FeedLensShell.tsx`).** A real CV is
  never a URL param. `FeedLensShell` reads `["me","cv"]` (shared query key with
  `useMyCvs()` — no extra request) to find the row with `isActive: true`, the same one
  `GET /feed`'s JWT resolution scores against; a just-uploaded CV (before that list
  refetches) and `saved.activeCv` (localStorage) are the optimistic bridges for the gap.
  `manualLens` — local `useState`, not a URL param — is which tab the user last clicked;
  it mirrors the old `?cv`-present/absent split without a round trip and preserves the
  existing UX exactly: a returning CV owner still lands cold by default, one click into
  warm (no auto-open — that was a deliberate choice, not an oversight; §8.1's
  "freshest-by-default" is about the unified path's own sort default, not about
  auto-entering the warm lens).
  `CvSelect.onPick` now calls the new `activateCv` mutation (§1) so a switch actually
  changes what `GET /feed` scores against everywhere — Telegram digests included, not just
  this tab. `/match`'s onboarding redirect (`buildMatchHref`) emits `open=cv` instead of a
  candidateId — a one-shot, id-free signal `FeedLensShell` reads once (then strips via a
  shallow replace) to land the completed flow in the warm lens, same visible result with no
  capability token in the URL. The account CV panel's "вакансії" link (`MyCvPanel.tsx`)
  activates the picked CV first when it isn't already active, then navigates the same way —
  fixing a latent bug in passing: that link pointed at `/?cv=<id>` even before this session,
  but the production route never read a real candidateId from `?cv` on its own (it needed
  the CV tab clicked too), so the old link only ever worked by coincidence when that CV was
  already active.

`redact-cv-links.ts` (`?cv=` scrubbed from PostHog payloads) and `robots.ts`'s `/*cv=`
disallow rule are **kept**, not removed — defense against a stale external link still
carrying the old param, independent of whether this app generates one anymore.

---

## 4. Verification status — be precise about what this covers

Every commit this session: `pnpm lint` (both apps) · `pnpm exec tsc --noEmit` (both apps) ·
`pnpm exec jest` (both apps, unit only) · `pnpm --filter @metahunt/etl build` ·
`pnpm build:web` — all green, every commit.

**Not run this session, at all: `pnpm test:etl:int`, `.scratch/met-144/run-gate.sh`, any
browser check.** This sandbox has no `docker` binary — `pnpm docker:infra`/`docker:up` fail
outright, so the local Postgres this repo's int-test harness needs was never reachable.
That is a *harder* gap than previous sessions hit (they had docker but not a headless
browser); everything in §1–§3 above is verified by types, unit tests, and two production
builds succeeding, not by a query actually running against real data or a page actually
rendering. Before merge:

1. `pnpm docker:infra`, then `pnpm test:etl:int` — especially
   `candidate-loader.int.spec.ts`'s two new active-CV cases and `me.int.spec.ts`'s three
   new `activateCv` cases (§1), and a rerun of the existing `feed.int.spec.ts` /
   `score.int.spec.ts` suites the refactor pass (§0) touched call sites in but not behavior.
2. `.scratch/met-144/run-gate.sh` for the full lint·test·test:int·build sweep this session
   couldn't run.
3. **A real browser pass is now overdue, not just "still open."** Nobody has looked at
   `/feed` or `/` running since before this session's rewrite. At minimum: upload a CV,
   confirm it renders warm and the "CV" tab reflects it; switch between two CVs via
   `CvSelect` and confirm the *feed* (not just the UI) reflects the switch (i.e. actually
   hits the new active one — this is the one behavior with no unit-test substitute, since
   it depends on the JWT + `activateCv` + `GET /feed` chain end to end); try a sample from
   both routes; complete `/match`'s onboarding flow and confirm it lands warm via `open=cv`.

---

## 5. What's left (owner decision, not a session's to make)

- **Merge this branch.** Step 7 is code-complete pending §4's verification.
- **Step 8** (delete `POST /ranking/match`, `GET /cv/:id/matches`,
  `GET /cv/samples/:id/matches`, `RankingService.rankByRefs` + its now-orphaned callers,
  `MatchResponse`/`RankedVacancy` if nothing else ends up wanting them) — only after step 7
  is merged and the production route has been exercised for real (§4.3). One-way door, per
  the parent file's own rule — a session can take this to a green PR, not past it.
- **Step 9** (Telegram digest reads `match` off the DTO) — untouched this session, as
  instructed.
