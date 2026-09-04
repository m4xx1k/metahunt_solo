# Unified feed ⊕ score — step 8 + merge (PR #206)

Third and final tracker file for `feat/met-144-unified-feed-score`. Earlier
history: [`unified-feed-score.md`](unified-feed-score.md) (steps 1–6, hit the
600-line cap) → [`unified-feed-score-step7.md`](unified-feed-score-step7.md)
(step 7 + 7b + the `?cv=` removal). This file: step 8, the pre-merge review
pass, and the step 9 hand-off.

One thesis, unchanged since step 1: **Fit is an optional field on a vacancy
card, not a separate endpoint.**

---

## 1. What shipped in PR #206

37 commits off `main`. Merged 2026-09-04 after the owner ran the browser pass
(§3) and CI went green.

| Area | What landed |
|---|---|
| **1–5 backend** | `GET /feed` is the single entry. Two paths: **cheap** (freshness sort → score only the 20 page rows via `overlayFor`) and **full** (`sort=score` / `minFitTier` → score inside the page query via `fragments()`). One `buildWhere`, one `rankedPage`, one `resolveViewer`. |
| **6** | `viewerSkills` on the response → the card computes ✅/❌/➕ itself via `skillDiff`. Fit panel on the vacancy detail page (`GET /feed/vacancy/:id` + `OptionalAuthGuard`). |
| **7** | Client moved onto `GET /feed` behind a temporary `to-match-response` adapter — the old warm markup was left untouched (nothing to verify it against yet). |
| **7b** | Adapter and the cold/warm lens fork removed. One `["feed", query]` query, one `VacancyMatchCard`, one `FeedShell` body. −1212 lines. `SortControls` moved to `features/vacancy-filters/`; new `FeedRail` (CvSelect · CandidateProfile · SkillRecommendations · CvSubscribe). |
| **8** | Three dead matching HTTP endpoints deleted: `POST /ranking/match`, `GET /cv/:id/matches`, `GET /cv/samples/:id/matches` + their controller glue. etl unit 561 → 557. **Service layer kept** — see §2. |
| **`?cv=` removal** | `?cv=` is gone from the production feed. A signed-in viewer's CV is resolved from the JWT (`resolveViewerCandidateId`); `?sample=<allowlisted id>` is the only query param that scores the page for an anonymous visitor. `?cv=` links now render a plain, indexable `/`. |
| **post** | Dropped the passive `?roles` preselect; fixed the off-stack toggle; view controls moved into the `jobs` results-header row; rewrote the Fit tooltip and role labels; `?sample=<foreign uuid>` now 404s instead of 500. |
| **review pass** | Stale `requireOverlap` comment in `ranking.service.ts` corrected (it claimed the feed path "leaves overlap off" — it doesn't; only the cheap date path skips `rankedPage`). Dead `ScoreBreakdown` / `ScoreSignal` / `ScoreSignalKind` types removed from `web/lib/api/ranking.ts`. `ColdRecsTeaser` collapsed to its only reachable branch (the shell only mounts it with no viewer, so `savedCvId` was always `null`). |
| **SEO fix** | CI's `contract (seo)` job still asserted `/?cv=<uuid>` must be `noindex`. With `?cv=` retired, that URL is a plain indexable `/`. Moved the noindex / token-leak guards in `scripts/seo-audit.ts`, `apps/web/app/robots.ts`, and `md/runbook/seo-contract.md` from `?cv=` to its successor `?sample=` (which `generateMetadata` already sends `noindex` for). Dropped `Disallow: /*cv=` — a Disallow would stop a crawler ever seeing the `noindex` on a sample link. |

### Single source of truth, as it stands now

- **Backend:** one scoring CTE (`score/score.sql.ts::rankedCte`), one contract
  (`score/score.contract.ts`), one `resolveViewer` / `overlayFor` / `fragments()`
  (`score/scorer.port.ts`), one full-path assembly (`score/ranked-page.ts::rankedPage`,
  used by both `FeedService.searchScored` and `RankingService.rankByRefs`), one
  filter builder (`feed/feed.service.ts::buildWhere`), one composition root
  (`feed/resolve-feed-query.ts`). No SQL or formula duplication.
- **Frontend:** one query key, one card, one shell body, one codec
  (`feed-query.ts` + `url-params.ts`), one `useResults` hook.

---

## 2. What's left — step 9: Telegram digest onto the feed path

**This is the largest remaining win and the reason the step 8 service-layer
deletion was deferred.**

The Telegram CV-digest is the *only* caller left of `RankingService.rankByRefs`
+ `buildItems` + `CandidateMatchService` + `MatchResponse`/`RankedVacancy` — and
it throws away almost everything they compute:

```ts
// 04-notify/telegram/subscription-matcher.service.ts::matchByCv
const res = await this.candidateMatch.match(candidateId, {...}, 1, MAX_VACANCIES_PER_RUN);
return { items: res.items.map((i) => i.vacancy), total: res.total, label: ... };
```

It keeps `items[].vacancy` and `total`; it discards `fit`, `breakdown`, `diff`,
`relevance`, `onStack`, `resolved`. ~200 lines compute a rich per-vacancy
payload that goes straight to the bin on every digest run.

### The change

Move `subscription-matcher.matchByCv` from `CandidateMatchService.match` to
`FeedService.search(params, scorer)` — the digest only needs `VacancyDto[]` +
`total`, which the feed already returns.

### What becomes dead and gets deleted afterwards

`RankingService.rankByRefs`, `.match`, `.buildItems`; `CandidateMatchService`;
`ranking.contract.ts::MatchResponse` / `RankedVacancy` / `MatchFilters`;
`CandidateMatchParamsDto` (check `me.contract.ts` for a lingering reference).

### Watch out

- **`emitMatchScored`** — the `match_scored` event (used for threshold
  calibration) is emitted from `rankByRefs`. Either move the emit into
  `FeedService.searchScored`, or drop it deliberately with a note. Don't lose it
  silently.
- **`ranking.int.spec.ts`** has ~6 cases pinned to `RankingService.match`.
  Rewrite them onto `rankByRefs` with pre-resolved skills, or onto the feed
  path.

---

## 3. What's left — one source of truth for "who is the viewer"

Still two derivations of the viewer:

- **Cards** learn it from the server (`viewerSkills` on the response).
- **Chrome** (sort controls, CV rail, `hasViewer`) derives it on the client
  from `["me","cv"]` + localStorage in `FeedShellIsland`.

Visible today: on SSR for a signed-in user the cards are scored but the controls
and the right rail are absent until hydration — the exact bug class this whole
initiative set out to kill, moved up one level.

**Fix:** add `viewerCandidateId: string | null` to `FeedResponse` (the backend
already resolves it in `feed.controller.resolveViewerCandidateId` — just thread
it into the response body). Then `FeedShell` reads that one field; the
`["me","cv"]` + localStorage derivation in the island goes away entirely.

---

## 4. What's left — optional / owner calls

- **Retire the `/feed` lab route.** It now duplicates `/` exactly — same card,
  same query, same controls. Deletes: `app/feed/**`, `lab-query.ts`,
  `FeedLabShell`.
- **`/match` post-onboarding landing.** It currently lands on the freshest-first
  feed. Landing on `/?sort=score` was discussed but contradicts the locked §8.1
  decision ("freshest by default"), so it's a product call for the owner.
- **Minor dead code** noticed in the review pass, not touched:
  `RankingService.match` has no production callers since `72e4544` (only the int
  tests above); `apps/web/lib/api/ranking.ts` still exports `cvApi`-adjacent
  types worth a sweep when step 9 lands.

---

## 5. Verification (PR #206)

- **Gate green at every commit:** `.scratch/met-144/run-gate.sh` — etl unit
  **557**, etl int **147**, `pnpm build`. Web: `tsc --noEmit` · `eslint` ·
  `jest` **184** · `pnpm build:web`.
- **API smoke (curl vs the running stack):** anon `/feed` → items, no
  `viewerSkills`, no fit; `?sample=<not-allowlisted>` → 404, `?sample=<garbage>`
  → 400; `?sample=<Python Backend>&sort=score` → scored + `viewerSkills` +
  `offStackHidden`, total 5254; `sort=date` → freshness order, low/zero fit on
  every card, total 14231; signed-in `sort=score` → 6810,
  `minFitTier=STRONG` → 69, `includeOffStack=true` → 7920; web `/`, `/feed`,
  `/match`, `/?sample=` all SSR 200. `pnpm seo:audit` → PASS.
- **Browser pass (owner, 2026-09-04):** (a) anon → locked slots; (b) `?sample=`
  → badges + diff counts + `CandidateProfile`; (c) signed-in active CV → scored
  feed + rail; (d) CV switcher moves profile + card scores together (the
  `0c7854c` regression stays fixed); fresh/sort/off-stack controls move the
  list; `/match` onboarding lands on a scored feed; mobile width of the `jobs`
  row holds.
