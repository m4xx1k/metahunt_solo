# market-snapshot — public home page with market widgets + vacancy list

**Branch:** `feat/market-snapshot` · **Status:** spec · **Started:** 2026-05-09

## Goal

Replace the marketing landing on `/` with a **public market snapshot page**: a hero band with three live aggregate widgets (top skills · seniority distribution · work-format donut + reservation tile) plus a "live counter" of total vacancies, followed by a clean public-styled vacancy list.

Marketing copy is preserved at `/welcome` for anyone who actually wants the long pitch. The home URL becomes utility: a visitor lands on `/` and immediately sees what the project is by looking at real numbers, not a sales page.

## Audience & non-goals

**Audience:** anonymous public visitors — candidates browsing the UA IT job market, plus the operator (founder) who wants the live numbers visible at a glance.

**Out of scope (deferred to other trackers):**
- Public drill-down detail pages (`/vacancies/:id`, `/records/:id`, `/ingests/:id`) and the `(landing)`→`(public)` rename — handled by [`vacancy-lineage.md`](./vacancy-lineage.md). This tracker leaves those concerns alone; cards link to the existing `/records/:id` operator page until lineage ships.
- Filterable aggregates (skills-of-the-week, time-bucketed deltas, salary heatmaps) — deferred to a follow-up market-explorer tracker.
- Sparkline / time-series widget (Variant 2 element from the brainstorm). The aggregates endpoint here is point-in-time only.
- Authentication.
- Public detail pages for vacancies — public list links open the *external* posting (`vacancy.link`); internal drill stays operator-flavored.

## Information architecture

Route changes inside `apps/web`:

```
app/
  (landing)/                              [keep group name; lineage rename is its own concern]
    page.tsx                              [REWRITE]  market snapshot (hero + list)
    welcome/
      page.tsx                            [NEW]      moved old landing — re-uses existing _components/*
    _components/
      hero/                               [DEPRECATED] still used by /welcome
      problem/, how/, result/, ai/,       [unchanged] still used by /welcome
        roadmap/, about/, cta/
      market-snapshot/                    [NEW]      page-private widgets for /
        Snapshot.tsx
        TotalCounter.tsx
        TopSkills.tsx
        SeniorityBars.tsx
        FormatDonut.tsx                   (donut + reservation stat in one tile)
      vacancy-list/                       [NEW]      page-private list section for /
        VacancyList.tsx
        PublicVacancyCard.tsx
```

**Redirects.** None required — `/` rewrites in place. Header nav for `/welcome` keeps its anchor links (`/welcome#problem` etc.) so deep-links from old promo material stay intact.

**Header nav (landing).** Today's nav points to anchors on `/`. After this change it splits:
- On `/` (snapshot): nav has `вакансії` (scrolls to list) · `моніторинг` → `/dashboard` · `про проєкт` → `/welcome`.
- On `/welcome`: nav unchanged from current (anchors to sections).

Header is one component; it picks nav variant from a prop set per page.

## Hero composition

Variant 3 from brainstorm — "market snapshot". Two rows.

**Row 1 — text + counter (header band)**

```
┌──────────────────────────────────────────────────────────────────┐
│ Метахант                                       ┌─────────────┐    │
│ агрегує IT-вакансії з DOU та Джині, нормалізує │   1 247     │    │
│ роль / стек / формат і викладає одним списком  │  вакансій   │    │
│                                                │  на ринку UA│    │
│ ● оновлено 12 хв тому · DOU + Джині            └─────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

- Left text block max-width ~520 px, headline + 2-line subtitle + status row.
- Status row dot is brand-accent and pulses (P2). Text follows.
- Right block is the **TotalCounter** card — single big number, label below, source line below that.
- Counter is the dominant visual; ratio ~3:2 left:right on desktop, stacked on mobile.

**Row 2 — three-widget grid**

```
┌──── Top skills ────┬──── Seniority ─────┬──── Format ──────┐
│ TypeScript ████ 38%│ Junior   ▁         │                  │
│ Python     ███  29%│ Middle   ████      │      ◔ 68%       │
│ Go         ██   18%│ Senior   ███       │      remote      │
│ React      ██   17%│ Lead     ▁         │                  │
│ AWS        █    14%│ Principal ▁        │ ─────────────── │
│ Node       █    12%│                    │ 14% з броню-     │
│ K8s        █    10%│                    │ ванням           │
│ SQL        █     9%│                    │                  │
└────────────────────┴────────────────────┴──────────────────┘
```

- Equal three-column grid on desktop (≥1024 px), single column on mobile, two columns at md.
- Each tile: title row + content. Tile background uses the same surface token as other dashboard cards (`bg-surface`, `border-border`, rounded-lg).
- Top skills: top 8 skills by count, horizontal bars, label · count · share-%.
- Seniority: vertical bar histogram, INTERN→C_LEVEL on x-axis, count above each bar.
- Format: donut showing REMOTE / HYBRID / OFFICE; below the donut, a divider, then a single-line stat "X% з бронюванням". The format tile carries the reservation stat because both are short single-glance signals.

Below row 2 — a divider, then the vacancy list section.

## Widget specs

### TotalCounter

| Property | Value |
|---|---|
| Source | `aggregates.total` |
| Format | thousands grouping (`1 247`) |
| Subtitle | "вакансій зараз на ринку UA" |
| Status row | `● оновлено N хв тому · DOU + Джині` (sources joined from `aggregates.sources[].name`) |
| Empty state | If `total === 0` show "ринок порожній — пайплайн дивиться, але нічого не знайшов" (defensive only — total is non-zero in steady state) |

### TopSkills

| Property | Value |
|---|---|
| Source | `aggregates.topSkills` (top 8 by count) |
| Bar | width = `count / topSkills[0].count` (relative to leader, not to total) |
| Label | node `label` |
| Right column | `Math.round(count / total * 100)%` |
| Filter | only `status='VERIFIED'` skills (matches list default) |

### SeniorityBars

| Property | Value |
|---|---|
| Source | `aggregates.seniorityDist` |
| Order | INTERN · JUNIOR · MIDDLE · SENIOR · LEAD · PRINCIPAL · C_LEVEL |
| Hide | seniorities with count 0 (don't pad axis with empty bars) |
| Label | short form: intern / junior / middle / senior / lead / principal / c-level |
| Tooltip on hover | `${label}: ${count} (${share}%)` |

### FormatDonut

| Property | Value |
|---|---|
| Source | `aggregates.workFormatDist` (REMOTE / HYBRID / OFFICE) |
| Center label | dominant share — e.g. "68% remote" if REMOTE leads |
| Legend | small pills below donut: `● remote 68%  ● hybrid 22%  ● office 10%` |
| Reservation stat | computed from `aggregates.reservationCount / aggregates.reservationKnownCount`. Display below divider: `14% з бронюванням`. Do not divide by total — only count vacancies where `hasReservation !== null`. |

### Vacancy list

Below the snapshot. Same data as today's `/vacancies` route, just with a public-styled card and the snapshot page's chrome.

**Initial fetch:** `vacanciesApi.list({ page: 1, pageSize: 20, includeRoleless: false, includeAllSkills: false })`. Verified-only by default.

**Pagination:** classic `Pagination` component (already used at `/vacancies`). Query string lives on `/`.

**Filters:** none in v1. Filters are an explicit out-of-scope item — adding them turns `/` into a search app, which is what `/vacancies` (operator) and a future market-explorer are for.

## Aggregates endpoint contract

### `GET /vacancies/aggregates`

**Query params:** none in v1. Aggregates are global (over all VERIFIED-role vacancies — same default as the list).

**Response shape:**

```ts
interface VacancyAggregatesResponse {
  total: number;
  lastSyncAt: string | null;     // ISO; max(loadedAt) across all eligible vacancies
  sources: Array<{
    id: string;
    slug: string;
    name: string;
    count: number;
  }>;
  topSkills: Array<{             // up to 10; consumer renders 8
    nodeId: string;
    slug: string;
    label: string;
    count: number;
  }>;
  seniorityDist: Record<Seniority, number>;
  workFormatDist: Record<WorkFormat, number>;
  engagementDist: Record<EngagementType, number>;   // returned for future use; v1 UI ignores it
  reservationKnownCount: number;  // count where hasReservation IS NOT NULL
  reservationTrueCount: number;   // count where hasReservation = true
  salaryDisclosedCount: number;   // count where salary_min OR salary_max IS NOT NULL
}
```

**Eligibility rule (matches list default):** include only vacancies whose role node has `status='VERIFIED'`. This keeps numbers consistent with what the list shows by default.

**Skill counting:** join `vacancy_nodes` × `nodes` where `nodes.type='SKILL'` AND `nodes.status='VERIFIED'`. Count distinct vacancies per node. `is_required` is ignored in v1 — count any link.

**Histograms:** `GROUP BY` on the enum column. Missing keys (zero count) MAY be omitted; fetcher fills missing keys with 0.

**Caching.** Server side: NestJS service can keep a 60-second in-memory cache (single key — there are no params). Client side: Next.js page sets `export const revalidate = 300` (5 min). Both are fine to skip in v1 if it complicates the change — the query is cheap (`vacancies` table is < 10k rows).

**Frontend fetcher.** New file `lib/api/aggregates.ts` mirroring `vacancies.ts`'s style — typed response + a single `aggregatesApi.get()` function.

## Vacancy card spec (public)

New component `app/(landing)/_components/vacancy-list/PublicVacancyCard.tsx`. Distinct from the operator `VacancyCard` at `app/(investigation)/vacancies/_components/VacancyCard.tsx` — the operator card is dense + monospace + debug-flavored; the public card is calmer.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│ Senior Backend Developer                              [DOU]      │
│ Acme Corp · Kyiv · remote                                        │
│                                                                  │
│ Senior · Full-time · English Upper-Intermediate                  │
│ TypeScript · Node · PostgreSQL · AWS · +3 more                   │
│                                                                  │
│ $4 000 – 6 000 / month                                           │
│                                                                  │
│                              [подати заявку ↗]  [запис у нас →] │
└──────────────────────────────────────────────────────────────────┘
```

**Fields:**
- Title row: `vacancy.title` left, source badge right.
- Subtitle row: `company?.name ?? '—'` · `locations[0] ?? ''` · `workFormat label`. Skip empty fields, separator only between non-empty.
- Tag row: `seniority` · `employmentType` · `englishLevel`. Each as a small tag. Skip nulls.
- Skills row: top 5 skills (required first, then optional), `+N more` if truncated.
- Salary row: `formatSalary(salary)` — if all null show `ЗП не вказано` in muted color (intentional — Djinni gap is a *visible* part of the market story).
- Action row: external apply link (target=_blank, `vacancy.link`) + internal record link (`/records/:rssRecordId`). Both styled as small text-buttons; apply is primary, record is secondary.

**Empty data handling.** Most fields are nullable. The card MUST render with only `title` + `source`; everything else is gracefully skipped.

**Reuse.** The `format.ts` helpers in `lib/` already format salary/locations — reuse, don't recreate.

## Files & tier discipline

Per `apps/web/CLAUDE.md` 3-tier rule: all new components are **tier 3 page-private**. Nothing graduates to `components/data/` or `components/shared/` in this work.

```
apps/web/
  app/(landing)/
    page.tsx                              REWRITE  -> snapshot page
    welcome/page.tsx                      NEW      -> imports existing sections
    _components/
      market-snapshot/Snapshot.tsx        NEW
      market-snapshot/TotalCounter.tsx    NEW
      market-snapshot/TopSkills.tsx       NEW
      market-snapshot/SeniorityBars.tsx   NEW
      market-snapshot/FormatDonut.tsx     NEW (renders donut + reservation stat in one tile in v1; split into ReservationTile.tsx if a second consumer appears)
      vacancy-list/VacancyList.tsx        NEW
      vacancy-list/PublicVacancyCard.tsx  NEW
  components/data/
    Donut.tsx                             reused
    StackedBar.tsx                        reused for SeniorityBars (or new bare component if API doesn't fit)
  lib/api/
    aggregates.ts                         NEW
  components/shared/Header.tsx            EDIT (nav variant prop or per-page links array)

apps/etl/src/vacancies/
  vacancies.controller.ts                 EDIT  -> @Get('aggregates')
  vacancies.service.ts                    EDIT  -> getAggregates()
  vacancies.contract.ts                   EDIT  -> response type
```

**Promotion rule reminder:** `PublicVacancyCard` and `VacancyCard` (operator) are **two different cards** on purpose. Do not unify by extracting a "VacancyCardBase" — they have different audiences and density goals. Per `md/engineering/DESIGN.md` rule-of-three, only extract when a third consumer arrives.

## Phasing

### P1 — snapshot core (this branch's main scope)

1. **Backend.** Add `GET /vacancies/aggregates` endpoint + service method + contract type.
2. **Frontend lib.** Add `lib/api/aggregates.ts` typed fetcher.
3. **Move old landing.** Create `app/(landing)/welcome/page.tsx` that imports the existing `_components/{hero,problem,how,result,ai,roadmap,about,cta}` sections — same component tree, just under a new route.
4. **Build snapshot widgets.** Implement 4 market-snapshot components: TotalCounter, TopSkills, SeniorityBars, FormatDonut (the last carries the reservation stat inline in v1).
5. **Build public vacancy card + list.** New `PublicVacancyCard` + `VacancyList` page-private wrappers. Use existing `Pagination`.
6. **Rewrite `/`.** New `(landing)/page.tsx` composes `<Header>` + `<Snapshot>` + `<VacancyList>` + `<Footer>`. Two parallel server fetches: aggregates and first page of vacancies.
7. **Header.** Add per-page nav variant; landing-snapshot variant points to `/welcome` for the about-the-project link.
8. **Smoke.** Manually verify `/` renders, numbers match `psql` spot-check, `/welcome` still works, all anchor links from old marketing copy resolve, `/dashboard` link unchanged.

### P2 — animations (separate branch / commit at end of P1)

See **Animations** section below. Goal is one focused commit in the same branch, *after* P1 ships and looks correct in static form.

### Out of phasing (won't land here)

- Time-series sparkline (Variant 2 element).
- Filter chips on `/` (kept on `/vacancies`).
- "Skill of the week" delta widget — needs a snapshot table or daily aggregates. Track separately.
- `(landing)` → `(public)` group rename — owned by `vacancy-lineage.md`.

## Animations (P2 follow-up)

Single commit at the end of P1. Goal: page feels *alive* without becoming circus. All animations driven by Framer Motion (`framer-motion` — verify if already a dep; install if not).

| Element | Animation | Trigger | Duration | Easing | Notes |
|---|---|---|---|---|---|
| TotalCounter big number | count-up 0 → final | mount | 800 ms | `easeOut` | Use `motion.span` + `useMotionValue` + `animate()`. Format on each frame via `Intl.NumberFormat`. Skip when value < 50 (avoids weird tick on near-empty data). |
| Status-row "live" dot | breathing pulse, opacity 0.4↔1.0 | always | 2000 ms loop | `easeInOut` | Stops on `prefers-reduced-motion`. |
| Snapshot tiles (Top skills / Seniority / Format) | fade-in (opacity 0→1) + translate-y 12 → 0 | mount, staggered | 350 ms each, 80 ms stagger | `easeOut` | Container is a `motion.div` with `variants` + `staggerChildren`. |
| Top-skill bars | width 0% → final % | tile becomes visible (intersection observer) | 700 ms | `easeOut` | Bar widths animate one-by-one with 40 ms stagger. |
| Seniority bars | height 0 → final | same as above | 600 ms | `easeOut` | Same stagger pattern as skills. |
| Donut | strokeDashoffset full → final | tile becomes visible | 700 ms | `easeOut` | Single arc per slice; stagger by slice. |
| Vacancy cards | fade-in opacity 0→1 (no translate) | initial render only, not on pagination | 250 ms | linear | Subtle. Pagination clicks re-render server-side; treat first-paint and pagination-paint the same to avoid flash. |

**Reduced motion.** Honour `prefers-reduced-motion: reduce`. Strategy: a single `useReducedMotion()` hook in each animated component returns the static value path. The count-up jumps straight to the final number; tiles render with final styles; bars/donut start at final width.

**Performance budget.** Animations only on initial mount + intersection. No infinite loops except the live-dot pulse. Bundle increase from framer-motion is ~50 KB gzipped — acceptable for a public page that's one of two on the landing chrome.

**What we won't animate.** Card hover (no extra effects beyond CSS). Pagination transitions. Header. Footer. Anything below the fold beyond first paint.

## Open questions / decisions

- **Verified-role default for aggregates.** Adopted: yes, match list default (`includeRoleless: false`). Rationale: numbers on the public page should match what the list below shows, otherwise "1 247 vacancies" + "list shows 800" looks broken.
- **Reservation denominator.** Adopted: divide by *known* count (`hasReservation IS NOT NULL`), not total. Rationale: dividing by total under-reports because Djinni often leaves it null. Show denominator-aware copy: `14% з бронюванням (з тих, де відомо)` — or accept the simpler `14% з бронюванням` and document the caveat. **Pick one during implementation; default to the simpler form unless it reads misleading.**
- **Salary stat in v1.** Aggregates returns `salaryDisclosedCount` but the v1 UI doesn't surface it. Reason: three widgets is the right density; salary disclosure belongs in a future "data quality / honesty" block. The data is available the moment we add the block — no backend change needed.
- **Sparkline.** Postponed. The current vacancies table doesn't carry a creation snapshot, so a sparkline either needs daily snapshots or `loadedAt` bucketing (which biases toward recently re-loaded vacancies, not net-new). Defer until a snapshot table exists.

## Risks

- **Aggregate query cost.** The skill aggregation joins `vacancy_nodes` × `nodes` × `vacancies`. At < 10k vacancies this is sub-50 ms; revisit if the table grows past 100k.
- **Header nav drift.** Adding a nav variant prop to `Header` doubles the surface area. Mitigation: keep variants as a `links` array prop already used today — landing-snapshot just passes a different array. No code branches inside `Header`.
- **Old-landing rot.** Moving the marketing landing to `/welcome` makes it second-class — easy to forget to update when copy changes. Mitigation: link from snapshot's "про проєкт" nav makes it discoverable; if it's not viewed, that's a useful signal it can be deleted entirely later.
- **Animation jank on slow devices.** Reduced-motion path covers accessibility; for general perf, animations are mount-once, no scroll-tied work, no heavy blur. Skill bars use `transform: scaleX` not width to stay on the compositor.

## Cross-links

- Brainstorm context: this conversation, 2026-05-09. Variant 3 chosen.
- Adjacent tracker: [`vacancy-lineage.md`](./vacancy-lineage.md) — public route group rename + drill-down detail pages. Sequenced after this.
- Aggregates endpoint contract lives in `apps/etl/src/vacancies/vacancies.contract.ts`; web type mirror lives in `apps/web/lib/api/aggregates.ts` (per ADR-0005, types are duplicated until a second consumer justifies extracting).
- Engineering style: `md/engineering/DESIGN.md` rule-of-three (no premature card unification), `md/engineering/STYLE.md` (no dead comments).
- Frontend tier rules: [`apps/web/CLAUDE.md`](../../../apps/web/CLAUDE.md).
