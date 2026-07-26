# feed ⊕ reverse-ats merge — one page, two lenses

Status: **BUILT + FLIPPED.** Shipped on branch `feat/merged-cold-lens`; the former
`/merged` beta is now the home feed at `/`. The standalone classic-feed and
`/reverse-ats` routes were folded in — reverse-ATS widgets promoted to
`features/cv-match/`, both old paths 307-redirect to `/`. UI is fully English
(except the Clerk-gated internal dashboard). Not pushed / not PR'd. Remaining:
pre-GA follow-ups from the pre-merge audit (a11y gaps, pip/tier coherence,
CV-endpoint auth + TTL). Move this tracker to `_done/` once those are triaged.
The planning notes below are kept for history.

Goal: merge `app/(feed)/[[...slug]]` (browse by tracks + filters) and
`app/reverse-ats` into one page that toggles between a **COLD** lens (no CV →
browse by tracks) and a **WARM** lens (CV loaded → ranked list + recs). Locked
design + prototypes: `.scratch/feed-merge-v2/README.md`; phased build:
`.scratch/feed-merge-v2/implementation-plan.md` (V1 = tracks top-band).

## ⚠️ Kickoff prompt — paste this at the start of next session

> We're building the feed⊕reverse-ATS page merge. This is a **planning-first,
> interview-first** session. **Before writing a single line of code, GRILL me —
> relentlessly, as hard and as much as you can.** I *want* to be interrogated;
> do not be agreeable.
>
> Rules for this session:
> 1. First read `.scratch/feed-merge-v2/{README,implementation-plan,user-flow,widgets,state-model,filters-and-multiselect}.md` and this tracker (`md/journal/migrations/feed-reverse-ats-merge.md`). Then read the "Foundation already shipped" section so you don't re-ask what's decided.
> 2. Work through **every** open question below, and any you discover. Use `AskUserQuestion` for concrete trade-offs (with real options + previews). One decision at a time is fine — depth over speed.
> 3. **Challenge my answers.** If I'm vague ("whatever you think", "make it clean", "you decide"), refuse the hand-wave and force a specific choice with a concrete recommendation + why. Steel-man the alternative I'm rejecting.
> 4. **Re-litigate even the "locked" decisions** (persistent tabs, V1 tracks-top-band, localStorage switcher) — the foundation is built now, so pressure-test whether they still hold. Override the usual "don't re-open settled decisions" default: for THIS session I'm explicitly asking you to.
> 5. Assume **nothing**. Prefer five sharp questions over one assumption. Surface hidden coupling, edge cases, and failure modes I haven't thought about.
> 6. Only after every open question has a firm answer I've committed to do you (a) write an implementation plan, get my sign-off, then (b) build the **smallest shippable slice first** — never the whole thing at once.
> 7. KISS/YAGNI throughout (see my memory). No new abstractions until a second consumer is real.

## Open questions to grill me on (get a firm answer on each before building)

**A. Routing & URLs** — Does the merged page replace `/` (today's feed), or live at a new route behind a flag? What happens to `/reverse-ats` — 308 redirect, alias, or deleted? Warm-lens URL: `?cv=<id>` on `/` vs a `/cv/<id>` path — which is canonical + shareable? A shared warm link is server-fetchable by candidate id (DB row) — confirm that's the intent. How does clicking a track reconcile with the existing `[[...slug]]` catch-all (`/track/<slug>` must keep working)?

**B. Lens vs tab state (the subtle one)** — Tabs flip freely, but "which tab is active" ≠ "do I have a CV". Is the active tab a 2nd URL param (`?lens=`), or does `?cv` present default to warm while a toggle shows browse *without* dropping `?cv`? What does `/?cv=X` vs `/?cv=X&lens=browse` each render on a cold load? Is the CV remembered in the URL (survives refresh) or only localStorage?

**C. localStorage switcher** — Exact schema + a `version` field? What happens when a saved CV's `candidate_id` 404s (do uploaded `type='user'` candidate rows persist forever, or get GC'd)? Build throwaway-local now vs shape it to migrate to the coming [[project_auth_initiative]] server-side model? Does subscribing add the sub to the switcher, and how does picking a sub replay its stored filters back into the URL?

**D. Widgets & composition** — Exact shape of the `VacancyCard` `matched`/`skillsSlot` prop: does the card understand have/missing/matched, or is it a dumb slot the page fills? Fold `MatchCard` into `VacancyCard` via the slot, or keep the wrapper? Where do `CvDetails`/`CvRecommendations` live — promote to `features/`, or stay page-private until a 2nd consumer (per apps/web/CLAUDE.md promotion rule)?

**E. Subscribe** — One `SubscribeTg` with a lens prop (filter-sub vs CV-sub params)? Fix the known **CvSubscribeButton domain/experience replay gap** now or defer? Warm subscribe needs a real uploaded CV (not a sample) — how is that enforced in the UI?

**F. Tracks band & responsive** — Re-confirm **V1 (tracks top-band)** now that the FilterRail exists, or revisit? Warm lens = no tracks band, right rail = cv-info — confirm. Mobile (breakpoints 1100/760): filters + tracks in one bottom sheet or two separate sheets?

**G. Scope / sequencing / MVP** — One big branch or incremental behind a new route? What's the smallest shippable slice (e.g. Phase 2 chrome on a hidden route, old pages untouched)? Are lens-switch + cv-upload analytics events required for v1? Do we delete `/reverse-ats` + its `_components` in this initiative or run both routes during a transition?

**H. Carry-over debt to decide on** — The two deferred **ADRs** (react-query data layer; slugs-in-URL) — write them this session or keep deferring? Confirm the merged page reuses the existing react-query SSR seed (coldKey/warmKey) with no new data layer.

## Foundation already shipped (do NOT rebuild)

The last two branches built the merge's substrate on the *existing* two pages:

- **Filters epic** ([filters-components.md](./filters-components.md), #59): one
  URL-backed `FilterState`/`FiltersApi` superset both pages consume; shared
  class-validator DTO; one `<FilterRail lens>`; **react-query data layer**
  (`useResults(lens)` + SSR-seed via `HydrationBoundary`, shallow `pushState`);
  freshness window. **T7 slugs in the URL** (this session) — `nodes.slug` +
  `NodeSlugResolver` at the API boundary.
- **reverse-ATS candidates** ([reverse-ats-candidates.md](./reverse-ats-candidates.md),
  #60): samples are real DB rows ranked via the same `/cv/:id/matches` path;
  ranker gained domain + experience; `useReverseAts` hook owns client state.

So Phases 0–1 of the implementation-plan (shared store, shared Multiselect) and
the ranker half of Phase 3 are **done**. What remains is the actual page.

## Prereqs (before starting)

1. **Merge the current stack to main**: #59 → main, then #60 → main (retarget),
   via `gh`. This deploys the filters epic + reverse-ATS + slugs. Prod DB is
   already migrated + backfilled (this session) — code just needs to ship.
   - ⚠️ **Blocker:** #59's `integration (etl)` CI check was failing — resolve
     before merge (see Carried-over follow-ups).
2. Branch `feat/feed-reverse-ats-merge` off the updated `main`.

## Remaining work (implementation-plan Phases 2 + 4–7 + warm-widget ports)

- [ ] **Phase 2 — lens chrome** (page-private `_components/` on a new/merged route):
  `LensTabs` (segmented `[ напрями │ під моє CV ]`, CV tab locked until a CV
  exists), `ProfileStrip` (warm header), `Hero`+dropzone, `TracksBand`
  (horizontal disciplines+children for the V1 cold band; reuse the vertical
  panel for the mobile sheet).
- [ ] **Phase 3 (warm widgets)** — port `CandidateProfile`→`CvDetails`,
  `SkillRecommendations`→`CvRecommendations`, unify subscribe into one
  `SubscribeTg` (lens prop). Add accented matched skills **inside** the shared
  `VacancyCard` via a `matched`/`skillsSlot` prop (composition, not a fork) so
  one card serves both lenses.
- [ ] **Phase 4 — localStorage switcher** (`SavedSwitcher`): saved CVs + subs,
  anonymous, no login; pick CV → `?cv=<id>`, pick sub → load its filters.
- [ ] **Phase 5 — compose V1 layout + responsive** (breakpoints 1100 / 760;
  mobile = filters + tracks in a bottom sheet).
- [ ] **Phase 6 — route migration**: `/reverse-ats` → merged route (`?cv` flow);
  keep `/` and `/track/<slug>`; delete ported `_components`.
- [ ] **Phase 7 — verify** (cold browse, upload→warm, back-to-tracks with CV
  remembered, switcher, subscribe both lenses, deep links, responsive) +
  lens-switch/cv-upload analytics events; reviewer + comment-cleanup pass.

## Carried-over follow-ups (from this session)

- **#59 `integration (etl)` CI failing** — `pnpm test:etl:int` (Testcontainers).
  Must green before merging to main. NB: CI only runs on PRs to `main`, so the
  etl jobs never ran on #60 — T7 needs an integration run too.
- **ADRs deferred** (filters epic DoD): "web client data layer = react-query +
  SSR-seed" and "slugs in the URL" — write both when doing the next doc pass.
- **`CvSubscribeButton` domain/experience replay** (from #60): the CV digest
  path doesn't thread domain/experience yet, though `MatchFilters` supports them.
- **Slugs — prod backfill is a permanent deploy step**: after any prod migrate
  that adds nodes, run `pnpm db:seed:node-slugs` (idempotent). New nodes get
  slugs at ingest automatically; the backfill only covers pre-existing NULLs.

## Links

- Prototypes + design: `.scratch/feed-merge-v2/{README,implementation-plan,user-flow,widgets,state-model,filters-and-multiselect}.md`
- Substrate trackers: [filters-components.md](./filters-components.md) · [reverse-ats-candidates.md](./reverse-ats-candidates.md)
