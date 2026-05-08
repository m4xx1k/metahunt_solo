# vacancies-api — silver vacancies HTTP API + web feed

**Branch:** `feat/loader-pipeline` (work landed here; never branched off `feat/vacancies-api`)
**Status:** MVP shipped · followups open
**Started:** 2026-05-05 · **MVP shipped:** 2026-05-06 (commit `0340ecf`)

## Goal

Expose the silver `vacancies` table over HTTP at `/vacancies` and consume it from `apps/web` as the silver feed at `/vacancies` (sibling of the landing-page `GoldenJobCard`). The wire contract is at `apps/etl/src/vacancies/vacancies.contract.ts` — server-side joins resolve refs (company name, role/skill names, source display name) so the UI never sees opaque FK ids.

## What shipped (commit `0340ecf`)

Backend (`apps/etl/src/vacancies/`):
- `vacancies.contract.ts` — DTO + query types, framework-agnostic.
- `vacancies.service.ts` — Drizzle list query joining `sources`, `companies`, `nodes` (role + domain), `rss_records` (link, publishedAt) + a second batched `vacancy_nodes`→`nodes` query for skills.
- `vacancies.controller.ts` — `GET /vacancies` with `q`, `page`, `pageSize`, `includeRoleless`, `includeAllSkills`. `BadRequest` on bad input.
- `VacanciesModule` wired into `AppModule`; covered by `app.module.spec.ts`.

Default behavior on the API:
- Role / domain / skills only surface when `nodes.status='VERIFIED'`.
- Vacancies that lack a verified role are excluded unless `?includeRoleless=true`.
- Unverified skills are dropped from the response unless `?includeAllSkills=true`.

Web (`apps/web/app/(investigation)/vacancies/`):
- `page.tsx` — Server Component, mirrors the `/monitoring` shell.
- `_components/VacancyCard.tsx` — silver card; headline shows `SENIORITY · role.name` (no raw posting title, no description block).
- `_components/FilterToggles.tsx` — Server-Component-friendly toggle row that flips `?includeRoleless` and `?includeAllSkills` via `<Link>` and resets `offset` on change.
- `lib/api/vacancies.ts` — typed fetcher mirroring the contract per [ADR-0005](../decisions/0005-vercel-for-frontend.md); same `NEXT_PUBLIC_API_URL` pattern as `monitoring.ts`.

## Followups

### Backend

- **F1 — Service spec.** `vacancies.service.spec.ts` covering: pagination, `q` ILIKE, multi-skill filter, salary floor + currency match, empty result. Equivalent to `monitoring.service.spec.ts` style.
- **F2 — Controller spec.** Default pagination, query parsing errors, forwarding.
- **F3 — Detail endpoint.** `GET /vacancies/:id` → `VacancyDetailDto` with full `description` (list ships `description: null` to keep payload small).
- **F4 — Filters not yet implemented.** Contract declares `sourceId`, `companyId`, `roleId`, `skillIds[]`, `seniority`, `workFormat`, `employmentType`, `englishLevel`, `engagementType`, `experienceMin/Max`, `salaryFloor`, `currency`, plus future `location` / `hasReservation` / `hasTestAssignment` / `loadedSince`. None are wired. Add as the FE asks.
- **F5 — Cursor pagination.** See D3.

### Open contract decisions

Pick before the FE saves filter URLs:

- **D1 — `skillIds[]` match mode.** Type currently AND. UX likely wants OR ("jobs matching my skills") or a `skillIdsAll` + `skillIdsAny` split.
- **D2 — Sort param.** No `sort` declared; service already orders by `loaded_at DESC`. Need `sort?: "newest" | "oldest" | "salary_desc"` + documented default.
- **D3 — Pagination model.** Offset paging duplicates rows on a streaming feed (loader writes mid-session). Move to `(loaded_at, id)` cursor (same as F5).
- **D4 — `total` cost.** Mandatory `COUNT(*)` on every keystroke is wasteful. Either `?withTotal=1` opt-in or replace with `hasMore: boolean`.

### Web

- **F6 — Landing nav link.** `/vacancies` isn't linked from the landing page yet. Add when this becomes user-visible (currently still under the `(investigation)` group breadcrumbs).
- **F7 — Empty-state copy + `loading.tsx` / `error.tsx`.** Page renders an inline "no vacancies match the filters" message; add the Next.js boundary files for streamed fallback + error display per `md/engineering/FRONTEND.md`.
- **F8 — More filter UI.** Once F4 lands, add corresponding filter chips next to `FilterToggles`.

## Decisions (locked from loader-pipeline)

- Resolver layer (Company / Node) lives in `apps/etl/src/loader/services/`. Vacancies API only reads silver tables — does NOT call resolvers (those are write-path only).
- `vacancies.locations` is `jsonb [{city, country}]`; the contract flattens to `string[]` (`["Kyiv, Ukraine", …]`).
- `nodes.status='NEW'` is hidden from this API by default; moderation UI is a separate initiative.

## Out of scope

- AI match scoring (`GoldenJob.ai`).
- Cross-source dedup (`appliesOn[]` length > 1) — schema doesn't support it; D8 just leaves the door open.
- Auth on the read endpoint — public read for now.
- Caching / etag — premature; revisit after first heavy FE consumer.

## Links

- Source-of-truth schema: `libs/database/src/schema/vacancies.ts`, `nodes.ts`, `companies.ts`, `vacancy-nodes.ts`.
- Loader (write path): [`_done/loader-pipeline.md`](_done/loader-pipeline.md).
- Reference UI on the landing: `apps/web/app/(landing)/_components/result/GoldenJobCard.tsx`.
- Contract pattern decision: [ADR-0005](../decisions/0005-vercel-for-frontend.md).
- Frontend patterns reference: [`md/engineering/FRONTEND.md`](../../engineering/FRONTEND.md).
