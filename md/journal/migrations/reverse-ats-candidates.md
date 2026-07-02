# reverse-ats-candidates — samples in DB · ranker domain+experience · hook extraction

**Branch:** `feat/reverse-ats-candidates` (stacked on `refactor/filters-components` / PR #59 — the T6 data layer)
**Status:** built + verified, PR open (not merged)
**Started:** 2026-07-02 · **Closed:** —

## Scope

Three linked reverse-ATS improvements (user directive 2026-07-02):
1. **Extract the component logic into a hook** — `ReverseAtsClient` was doing too much.
2. **Samples → DB** — a `candidate.type` = `user|sample` discriminator, seed the 5 hardcoded demo profiles as real `sample` candidate rows, serve them, and rank them through the same path as an uploaded CV.
3. **Domain + experience sections in reverse-ATS**, in the same order as the feed.

## Decisions

- **Samples-in-DB is the linchpin.** A sample is now a `candidate` row with a `candidateId`, so the picker and an uploaded CV rank through ONE path (`cvApi.matches(candidateId, …)`). The `{sample|cv}` fetch branch is gone — that's what let the component logic collapse into a hook.
- **Sample display label/hint live on `extracted.sample`** (user choice) — zero schema noise beyond `type`. `GET /cv/samples` reads them back.
- **Domain + experience are VACANCY filters on the ranker**, mirroring the feed's SQL (`inArray v.domain_node_id`; discrete experience tokens + `6+`, NULL passes). The candidate stays the query — no candidate-side domain/experience needed. Lifted `domainIds`/`experienceYears` onto the shared `FilterParamsDto` so `MatchDto` inherits them (feed already had them).
- **Subscribe + recommendations stay gated to uploaded CVs** (`isUpload`). A sample is a ranking preview; its owner can't subscribe to a digest. Only special-case kept.
- **Skill resolution reuses the canonical+alias lookup**; unresolved sample skills are kept as strings (like a real CV's unmatched), never created.

## Subtasks

- [x] **Phase 1 — ranker gains domain + experience** — `MatchFilters` + `ranking.service.buildFilters` (feed-mirrored SQL); `FilterParamsDto` gains both (MatchDto inherits); `ranking.controller` + `cv.controller` (`/cv/:id/matches` gains `?domainIds`/`?experienceYears` via new `parseCsv`); web `cv.ts`/`ranking.ts` contracts. *Verified:* etl tsc + jest; API Fintech 4529→544, experience tokens narrow.
- [x] **Phase 2 — samples → DB** — `candidate_type` enum + `candidates.type` (migration `0023`); `candidates.seed.ts` seeds 5 demo profiles (synthetic text, deterministic hash, skills→`candidate_nodes`, label/hint on `extracted.sample`); `db:seed:candidates` standalone runner (no nodes-seed status revert); `GET /cv/samples` (before `:id`). *Verified:* migration applied + seeded locally (skills 12/11/12/10/6 resolved); endpoint returns 5.
- [x] **Phase 3 — frontend** — page-private `useReverseAts` hook owns all state; `ReverseAtsClient` ~markup; `WarmSource`→`candidateId`, `fetchMatch`→`cvApi.matches` always; server page fetches `/cv/samples` + domain catalog, seeds first sample (HydrationBoundary), picker data-driven (`samples.ts` deleted); `FilterRail` shows domain+experience on the warm lens (feed order). *Verified:* web tsc + lint + prod build; runtime deep-link SSR, feed unaffected, no hydration errors.

## Prod / deploy

- Migration `0023` runs with the normal migrate step.
- **Run `pnpm db:seed:candidates` on prod once** (targeted, safe — only writes `type='sample'` rows + their `candidate_nodes`; never touches nodes). Idempotent (contentHash) — re-runnable to update the sample set. **Not done — deploy-time action for the user.**

## Definition of Done

- [ ] PR reviewed + merged via `gh` (after / together with PR #59 — this stacks on T6).
- [ ] Prod migrated + `db:seed:candidates` run + verified (`/cv/samples` returns rows; reverse-ATS ranks a sample; domain/experience filters narrow).
- [ ] Release note.

## Known follow-ups (not in scope)

- CV subscription (`CvSubscribeButton` → `CvMatchParams` → subscription-matcher) does NOT replay domain/experience — the digest path would need those fields threaded (Phase-1 `MatchFilters` already supports them). Minor parity gap, left for a follow-up.

## Links

- Depends on: `refactor/filters-components` T6 (react-query data layer) — PR #59.
- Prior reverse-ATS design: `md/journal/migrations/reverse-ats.md`.
