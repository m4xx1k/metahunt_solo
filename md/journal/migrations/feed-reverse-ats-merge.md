# feed ⊕ reverse-ats merge — one page, two lenses (NEXT SESSION)

Status: **planned, not started.** This is the entry point for the next session.
Branch to create: `feat/feed-reverse-ats-merge` (off `main`, after the current
stack is merged — see Prereqs).

Goal: merge `app/(feed)/[[...slug]]` (browse by tracks + filters) and
`app/reverse-ats` into one page that toggles between a **COLD** lens (no CV →
browse by tracks) and a **WARM** lens (CV loaded → ranked list + recs). Locked
design + prototypes: `.scratch/feed-merge-v2/README.md`; phased build:
`.scratch/feed-merge-v2/implementation-plan.md` (V1 = tracks top-band).

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
