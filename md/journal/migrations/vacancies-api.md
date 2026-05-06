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
- **F3 — Detail endpoint.** `GET /vacancies/:id` returning a `VacancyDetailDto` that ships full `description` (list responses currently send `description: null` — see D2 below).
- **F4 — Filters not yet implemented.** Contract declares `sourceId`, `companyId`, `roleId`, `skillIds[]`, `seniority`, `workFormat`, `employmentType`, `englishLevel`, `engagementType`, `experienceMin/Max`, `salaryFloor`, `currency` — none are wired. Add as the FE asks.
- **F5 — Cursor pagination.** Replace offset/limit with `(loaded_at, id)` cursor — the silver feed is streamed (loader writes mid-session) so offset paging duplicates rows. See D4.

### Open contract decisions (carried over from the earlier review)

These were never resolved before the MVP shipped. Locked semantics today; revisit when the FE pushes back:

- **D1.** `skillIds[]` match mode — currently AND in the contract type. Likely OR by default for "jobs matching my skills" UX, or split into `skillIdsAll` + `skillIdsAny`. Pick before any FE filter URL is saved.
- **D2.** `description` in list responses — currently shipped as `null` on every item (cheap fix). Either keep that and add `VacancyDetailDto` for the detail endpoint (F3), or ship a `descriptionSnippet` (~280 chars) in list + full on detail.
- **D3.** Sort param + default — no `sort` field declared. Add `sort?: "newest" | "oldest" | "salary_desc" | "relevance"` and document the default (`newest` = `loaded_at DESC`, which is what the service already does).
- **D4.** Pagination model — see F5.
- **D5.** `total` cost — mandatory `COUNT(*)` on every keystroke. Make optional via `?withTotal=1`, or replace with `hasMore: boolean`.
- **D6.** Location filter — `locations` is in the DTO but not filterable. Add `location?: string` (ILIKE) or `locations?: string[]` (any-of).
- **D7.** UA-market filters — `hasReservation?: boolean`, `hasTestAssignment?: boolean`. Reservation status is a critical UA-market dealbreaker.
- **D8.** Future-proof `link`/`source` — cross-source dedup isn't in the schema today, but `GoldenJob.appliesOn[]` shape suggests the right pre-emptive shape is `applyOn: Array<{ source: SourceRef; link: string|null; publishedAt: string|null }>`. Length 1 today, grows with dedup.
- **D9.** Salary filter currency semantics — document in JSDoc that "matches only vacancies whose `currency` equals the filter; rows with null currency are excluded". Backend has no FX rates.
- **D10.** `loadedSince?: string` filter for "new in last 24h" badge.
- **D11.** Typed `ApiError { statusCode, message, code? }` so FE has typed catch blocks.
- **D12.** Verify `locations` runtime shape — declared as `string[]`, but column is `jsonb` and BAML extraction may emit objects. Loader currently writes objects; service flattens `{city, country}` → `"city, country"`. Confirm by reading one extracted row in production.
- **D13.** `englishLevel` is misnamed long-term (UA market also cares about Ukrainian/Polish). Schema-level concern; out of scope here.

### Web

- **F6 — Landing nav link.** `/vacancies` isn't linked from the landing page yet. Add when this becomes user-visible (currently still under the `(investigation)` group breadcrumbs).
- **F7 — Empty-state copy + `loading.tsx` / `error.tsx`.** Page renders an inline "no vacancies match the filters" message; add the Next.js boundary files for streamed fallback + error display per `md/engineering/FRONTEND.md`.
- **F8 — More filter UI.** Once the backend supports any of D6/D7/D10/F4, add a corresponding filter chip / control next to `FilterToggles`.

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
