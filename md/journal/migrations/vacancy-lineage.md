# vacancy-lineage — public drill-down: vacancy → record → ingest

**Branch:** `feat/vacancy-lineage` (to be cut from `main`)
**Status:** spec · implementation not started
**Started:** 2026-05-08

## Goal

Make the full vacancy data lineage browsable end-to-end on the **public** web. From a vacancy in the silver feed, any visitor can drill DOWN to:

- the silver vacancy detail,
- the bronze RSS record it was extracted from,
- the ingest run that fetched that record,
- the source the ingest belongs to.

This is a **transparency / provenance feature**, not an operator tool. No auth, no admin UI, all reachable at root URLs. Companion read-only operator dashboard ([`operator-dashboard.md`](./_done/operator-dashboard.md)) links INTO these pages instead of repeating the lists.

## Hierarchy

```
[future] deduped vacancy cluster        /vacancies (becomes cluster list)
                │
                ▼
       silver vacancy                   /vacancies/:id
                │  extracted from
                ▼
       bronze rss record                /records/:id
                │  produced by
                ▼
       ingest run                       /ingests/:id
                │  belongs to
                ▼
       source (info card)               (no standalone public page; appears on ingest)
```

Every level shows:

- **Up-link** to its parent (e.g. record → ingest, ingest → source).
- **Down-link** to children (e.g. ingest → records produced, record → extracted vacancy).
- **Sibling pagination** where it makes sense (next/prev record in the same ingest).

## Routes

```
app/(public)/                          [NEW route group; rename of (landing)]
  layout.tsx                           landing chrome — public Header / Footer
  page.tsx                             marketing landing (moved from (landing))
  vacancies/
    page.tsx                           [moved from (investigation)/vacancies/]
    [id]/page.tsx                      [NEW]
  records/
    [id]/page.tsx                      [NEW]
  ingests/
    [id]/page.tsx                      [NEW]
```

Notes:

- `(landing)` is renamed to `(public)` since it now hosts more than the home page. Sub-folders inherit landing's chrome (Header/Footer).
- No flat `/records` or `/ingests` lists — those would be operator-flavored. Detail pages are reached only via drill-down from a parent.
- URLs use UUIDs for v1; slug routing is a follow-up (see Q2).

## Page contracts

### `/vacancies` (moved, unchanged for now)

Existing silver feed list. Stays public. Facet panel + detail link to `/vacancies/:id` lands as part of P5 of this tracker (was previously scoped to operator-dashboard).

### `/vacancies/:id`

**Hero:** seniority + role pill, title (raw posting title in muted small text), salary range, work format, locations, employment type, English level, engagement type, experience.

**Body:**

- **Description.** Currently `null` in list payload — requires F3 detail endpoint.
- **Skills.** Required + optional with status badges (VERIFIED / NEW). Hover shows alias matches.
- **Company card.** Name, slug, link to its other vacancies (filter on the list page).

**Lineage panel** (right column on desktop, below body on mobile):

```
> lineage
SOURCE     dou · dou.ua
INGEST     #f193b8c1 · 14:23 May 8 →  open
RECORD     "Senior fullstack…" →  open
LOADED AT  2026-05-08 14:23:47Z
```

**Backend dependency:** [`vacancies-api.md` F3](./vacancies-api.md#followups). New endpoint:

```
GET /vacancies/:id  →  VacancyDetailDto
```

`VacancyDetailDto` = existing `VacancyDto` + `description: string | null` (full, not truncated) + `rssRecord: { id, title, externalId } | null`.

### `/records/:id`

**Hero:** original RSS title, externalId pill, posting URL (external link), publishedAt, source.

**Body:**

- Raw description as fetched (sanitized HTML or plain text).
- **Extraction snapshot** when present: side-by-side bronze title vs. extracted role + skills. Useful as a "what did the LLM see" view.

**Lineage:**

```
> lineage
INGEST     #f193 · 14:23 May 8     →  open
SIBLINGS   record 14 of 47 in this ingest    ←  prev   next  →
EXTRACTED  silver vacancy "Senior Fullstack" →  open    (or "not extracted yet")
```

**Backend dependency:** `GET /monitoring/records/:id` exists but is operator-flavored. Either:

- (a) move/rename to `GET /records/:id` and redact operational fields, or
- (b) add a sibling public endpoint `GET /records/:id` and keep monitoring-side intact.

Either way the response needs an additive `vacancyId: string | null` join from `vacancies WHERE rss_record_id = :id`. **See Q1.**

### `/ingests/:id`

**Hero:** source code · status pill · started/finished · duration · record count · extracted count.

**Body:**

- **Records produced.** Paginated list of RSS records from this ingest, each linkable to `/records/:id`, with extraction status badge. Reuses existing `RssRecordCard`.
- **Sibling navigation.** "← previous run from this source · next run from this source →".

**No expose** of `workflowRunId`, `payloadStorageKey`, `triggeredBy`, raw `errorMessage` — those stay on the operator monitoring endpoint. **See Q1.**

**Backend:** uses `GET /monitoring/records?ingestId=:id` (already supported per `ListRecordsQuery.ingestId`) for the records list. Detail header data needs a public ingest endpoint per Q1.

### Future — deduped vacancy clusters

Out of scope for this tracker. Sketch only:

- `/vacancies` list becomes dedupe clusters — same job appearing on DOU + Djinni grouped into one card.
- `/vacancies/:clusterId` shows cluster summary + N constituent postings, each with its own bronze record + ingest lineage.
- Requires fingerprinting + clustering ETL stage.

## Backend deltas needed

| # | Change | Endpoint | Status |
|---|---|---|---|
| B1 | Vacancy detail | `GET /vacancies/:id` returning `VacancyDetailDto` | not implemented (F3) |
| B2 | Record → vacancy join | `GET /records/:id` adds `vacancyId` field | additive — see Q1 |
| B3 | Public ingest detail | `GET /ingests/:id` redacted shape | new endpoint (Q1) |
| B4 | Public records on ingest | `GET /records?ingestId=:id` redacted shape | new endpoint or alias |

The redacted public surface becomes a small parallel namespace; `/monitoring/*` stays operator-internal.

## Phasing

**P1 — Lift `/vacancies` to public group.** Rename `(landing)` → `(public)`; move `(investigation)/vacancies` → `(public)/vacancies`. No behavioral change. Operator dashboard's `/vacancies` link starts pointing here.

**P2 — Vacancy detail page.** B1 backend + frontend `/vacancies/:id` with body + skills + lineage panel.

**P3 — Record detail page.** B2 backend (additive `vacancyId`) + public records endpoint + frontend `/records/:id`.

**P4 — Ingest detail page.** B3 backend (redacted ingest shape) + frontend `/ingests/:id` listing produced records.

**P5 — Lineage links + facets.** Cross-links wired everywhere; `/vacancies` list gets its facet panel (work format, seniority, employment, english, engagement, salary floor, source); SEO meta + JSON-LD `JobPosting` on the vacancy detail page.

**Future** — dedupe clusters as the new `/vacancies` list shape.

## Open questions

- **Q1 — Public vs operator surface for records / ingests.** Original ask: "доступним для всіх". Risk: ingest data exposes internal IDs (`workflowRunId`, `payloadStorageKey`), full error stack traces, `triggeredBy` (could leak operator email). Resolution: **two parallel surfaces.** Public `GET /records/:id` and `GET /ingests/:id` serve a **redacted** shape; operator `GET /monitoring/*` keeps the full one. The public payload omits operational fields. Lock the redacted DTOs as part of P3/P4. **Decide before P3 ships.**
- **Q2 — Slug vs UUID URLs.** Vacancies have UUIDs. Job-board URLs typically use slugs (`/vacancies/senior-fullstack-at-acme-1234`). Defer slugs to a follow-up — UUID routing for v1.
- **Q3 — SEO + indexing strategy.** Public vacancy detail pages are great SEO targets. Need `<head>` meta + JSON-LD `JobPosting` schema + a sitemap. Add in P5. Vercel ISR or Cache Components for revalidation.
- **Q4 — Crawler load.** Public detail pages → crawlers will hit them at scale. Confirm caching strategy (probably `revalidate = 3600` + `cacheTag(['vacancy', id])` per `vercel:next-cache-components`). Not blocking P1.
- **Q5 — Records that have no extracted vacancy.** When a record's `vacancyId` is null, the record page exists but its lineage shows "not extracted yet". Should `/records/:id` 404 if no parent vacancy exists, or stay browsable from the ingest page? **Stay browsable** — extraction is async; the record is still real bronze data.

## Risks

- **R1 — Public exposure of operator data.** See Q1. Audit redacted DTO shape with `git grep` for `workflowRunId` / `payloadStorageKey` before P3 ships.
- **R2 — Crawler cost.** See Q4.
- **R3 — Detail page perf.** Each detail page loads a join. Vacancy detail joins 5+ tables (already does in the list service). Confirm with `EXPLAIN` once detail endpoint is added; a single-row fetch should be cheap, but skill resolution can fan out.
- **R4 — Stale extracted_data.** `rss_records.extracted_data` is JSON populated by the BAML extractor — when the extraction prompt changes ([Stage 06](../../roadmap.md#next)), older records show old shape. Render defensively — unknown fields ignored.

## Cross-links

- [`vacancies-api`](./vacancies-api.md) — F3 detail endpoint is the hard dependency for P2; F4 facet filters drive P5.
- [`operator-dashboard`](./_done/operator-dashboard.md) — sibling tracker. The dashboard's "activity stream" widget links INTO `/vacancies/:id`, `/records/:id`, `/ingests/:id` from this tracker, instead of duplicating list pages.
- [`taxonomy-curation`](./taxonomy-curation.md) — `/taxonomy` queue drawer (operator side) deep-links into `/vacancies?roleId=…` once that filter ships (also gated on F4).
- ADR-0005 — [`Vercel for frontend`](../decisions/0005-vercel-for-frontend.md) — web hand-mirrors backend types; same applies to the new redacted DTOs.
