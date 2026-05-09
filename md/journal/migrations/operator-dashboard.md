# operator-dashboard — internal dashboard for `apps/web`

**Branch:** `feat/operator-dashboard` (to be cut from `main`)
**Status:** P1 + P2 in review (2026-05-09) · P3 next
**Started:** 2026-05-08
**Context:** Stage 05 closed 2026-05-08 (silver layer + taxonomy curation Phase 1 + `/vacancies` API all green; pipeline 180 ingests / 0 failed / 100% extraction at the time of writing). This tracker is the Stage 06 surface — the single operator entry point that turns the now-stable pipeline into something observable and curatable without `psql`.

## Goal

Replace the single kitchen-sink `/monitoring` page with a sidebar-driven operator dashboard inside the existing `(investigation)` route group, and add the missing taxonomy curation UI on top of the read-only `/admin/taxonomy/*` API.

The dashboard surfaces **health and curation** (KPIs, source health, taxonomy coverage + queue), not browsable lists of vacancies / records / ingests — those lists live in the public drill-down ([`vacancy-lineage.md`](./vacancy-lineage.md)). The dashboard's "activity stream" widget visualises the full ingest → records → vacancies chain inline and links INTO the public detail pages on click, so the flow stays one click away without duplicating list views.

This is a **read-only** operator dashboard (Phase 1.5 of [taxonomy-curation](./taxonomy-curation.md)). It is **not** the moderator write-path UI, which Stage 05 keeps explicitly out of scope.

## Audience & non-goals

**Audience:** internal operators (founder + future team) inspecting pipeline health and curating taxonomy.

**Out of scope:**
- Public-facing detail pages for vacancies / records / ingests — handled by [`vacancy-lineage.md`](./vacancy-lineage.md).
- Flat operator-only `/ingests` and `/records` list pages — drill-in is enough; revisit only if filtering needs (failed-last-24h queries, etc.) actually surface.
- Moderator write actions (status changes, alias edits, merges) — Phase 2.
- Public-facing market explorer (salary heatmaps, role trends, company directory).
- Cmd+K command palette (deferred to a follow-up tracker).
- Authentication / role gating — `(investigation)` stays uncovered behind URL obscurity for now.
- New backend endpoints. Contract changes happen only inside `apps/web` (typed fetchers).

## Information architecture

```
app/(investigation)/                  internal operator UI
  layout.tsx                          [NEW]  Sidebar + content slot
  _components/Sidebar.tsx             [NEW]  group-private nav
  _components/InvestigationHeader.tsx [trim — sidebar takes nav, header keeps title only]
  dashboard/page.tsx                  [NEW]  renamed from monitoring/
  sources/page.tsx                    [NEW]  per-source health table
  taxonomy/page.tsx                   [NEW]  coverage + queue
  monitoring/                         [removed; replaced by 308 redirect → /dashboard]
```

`(investigation)/vacancies` moves to `(public)/vacancies` per [`vacancy-lineage.md`](./vacancy-lineage.md). The sidebar still **links** to `/vacancies` and to `/vacancies/:id` from the activity stream — those are public URLs, just not under operator chrome.

`next.config.ts` adds:

```ts
async redirects() {
  return [
    { source: "/monitoring", destination: "/dashboard", permanent: true },
    { source: "/monitoring/:path*", destination: "/dashboard", permanent: true },
  ];
}
```

### Sidebar layout

```
┌──────────────────────┐
│ [Logo]  metahunt     │
│         operator     │
├──────────────────────┤
│  OVERVIEW            │
│   > dashboard        │
│                      │
│  PIPELINE            │
│   > sources          │
│                      │
│  SILVER              │
│   > vacancies   ↗    │   ← outbound: /vacancies (public list)
│   > taxonomy   ⌄23   │   ← badge: NEW-status nodes count
├──────────────────────┤
│  as of HH:MM:SS      │
│  [↻ refresh]         │
│  v0.4 · prod         │
└──────────────────────┘
```

- The `↗` glyph on the vacancies link signals "leaves operator chrome" (the `/vacancies` list now sits in the public route group).
- Active link highlighted with accent color + left rail.
- Refresh button moves out of `InvestigationHeader` and into sidebar footer.
- Mobile (<1024px): sidebar collapses behind a hamburger.

## Page-by-page contracts

### `/dashboard` (was `/monitoring`)

**Section 1 — KPI strip (4 cards).**

- Ingests · last 24h · 7-day sparkline of run statuses.
- Records · last 24h · 7-day sparkline.
- Failed ingests · last 24h · count badge (red if > 0). Click → opens a drawer listing the failures with deep-links to `/ingests/:id` (public).
- Taxonomy queue · NEW-node count broken down by axis. The card renders one number per axis stacked (`ROLE 85 · SKILL 6662 · DOMAIN 210`), each segment linking to `/taxonomy?tab=<axis>`. SKILL is the load-bearing number — at one extraction-pass-of-the-corpus it sat at ~6.6k vs ROLE at <100 — so a single aggregate hides the backlog shape. Show "Total: N" beneath; color the SKILL number amber when ≥ 1k, red when ≥ 5k. ([baml-extraction-prompt-tuning](../../../todo/baml-extraction-prompt-tuning.md) is the lever that bends this curve.)

**Section 2 — Latest per source.** Existing `LatestPerSource` widget, enriched with inline 7-run status sparkline.

**Section 3 — Activity stream (the flow widget).**

The lineage chain rendered as one row per recent ingest, every entity clickable to its public detail page:

```
> activity
14:23  ✓  dou       ingest #abc7 → 47 records → 23 vacancies
12:01  ✓  djinni    ingest #de42 → 31 records → 19 vacancies
09:00  ✓  dou       ingest #f193 → 38 records → 17 vacancies
07:45  ✕  djinni    ingest #b8e1 — failed (timeout 15s)
```

- `ingest #abc7` → `/ingests/:id` (public).
- `47 records` → `/records?ingestId=:id` (or, post-`vacancy-lineage` P3, the ingest page's record list).
- `23 vacancies` → `/vacancies?fromIngest=:id` (filter not yet on the contract — see D2 below).
- Failed runs flag in red with the redacted error message.

This widget *is* the dashboard's "see the whole flow" affordance — replaces the previous separate `/ingests` and `/records` list pages. Last 10 events; no pagination — for deeper history, follow a link.

**Data:** `monitoringApi.stats()` + `monitoringApi.listIngests({ limit: 10 })` + `taxonomyApi.coverage()`. Per-ingest vacancy counts come from a `getIngest(id)` extension or a single SQL aggregate added later — see D3.

**Time-series source for sparklines:** `stats` does not currently return per-day buckets. For v1, render from the last 7 ingest statuses on the dashboard data. See D1.

### `/sources`

Table of all configured sources (one row per source):

| Column           | Source field                                                         |
|------------------|----------------------------------------------------------------------|
| Code             | `source.code`                                                        |
| Display name     | `source.displayName`                                                 |
| Last ingest      | `latestPerSource.lastIngestAt`                                       |
| Last status      | `latestPerSource.lastStatus` as pill                                 |
| 7-run sparkline  | last 7 runs from `listIngests({sourceId, limit:7})`                  |
| 24h records      | derived from records list                                            |
| % skill-verified | mean per-vacancy verified-skill share for this source — see D7       |
| Open             | `source.baseUrl` external link                                       |

Each row's "Last ingest" cell links to `/ingests/:id` (public, redacted).

The **% skill-verified** column is the per-source extraction-quality signal: when one source starts emitting more long-tail SKILL noise than the other, this number drops there alone — a degradation that volume-only columns hide. Today both sources sit ~60% (djinni 59.4% on 1011 vac, dou 60.0% on 590 vac), so the column has no story yet — but it becomes the first place to look when prompt-tuning lands and one source moves before the other.

**Data:** `monitoringApi.sources()` + `monitoringApi.stats()` + N parallel `listIngests({sourceId, limit:7})` (N = #sources, currently 2). Skill-verified % per source needs a new aggregate — see D7.

Per-source detail page (`/sources/:code` with full ingest history + record-volume chart) deferred to a follow-up tracker.

### `/taxonomy` (headline)

Two-pane layout (40 / 60).

**Left pane — Coverage:**

1. **Axis coverage (3 stacked bars).** ROLE / SKILL / DOMAIN with segments verified · new · missing. Numbers above each segment. Each bar carries a **health pill** at the right edge driven by `% missing` (vacancies on this axis with no taxonomy assignment at all): green `< 10%`, amber `10–30%`, red `≥ 30%`. As of 2026-05-08 this surfaces DOMAIN at 31% missing immediately — the single most actionable signal on the page. Thresholds live as constants in `_components/CoveragePanel.tsx`, not magic numbers in the SVG.
2. **Fully-verified vacancies donut.** "X of Y vacancies have all role + skills + domain VERIFIED." Sits next to a tiny three-step funnel `verified-role → verified-domain → verified-skills ≥ threshold` so the operator sees *where* vacancies drop out of full-coverage, not just the survival rate. (Shape today: 1527 → 912 → 114; the DOMAIN step is the load-bearing leak.)
3. **Verified-skill bucket histogram.** 6 buckets (`100`, `75-99`, `50-74`, `25-49`, `1-24`, `0`) showing how many vacancies fall into each — exact buckets that `taxonomy.service.getCoverage()` already returns.
4. **Per-source breakdown table.** Source code · vacancies · links · % verified.

**Right pane — Queue:**

1. **Tabs.** ROLE | SKILL | DOMAIN (default ROLE). Each tab shows `taxonomyApi.queue(type)` sorted by `usage_count desc`.
2. **Row.** node name · type · usage count (with bar) · aliases preview (truncated).
3. **Click → drawer.** `node detail` (id, name, type, status, aliases full list, created/updated) + **Fuzzy matches** list (other nodes with `pg_trgm.similarity ≥ threshold`, with score). Drawer also shows "this node is used by N vacancies" with a link to `/vacancies?roleId=…` (or `skillIds`, or none for DOMAIN — see D2).

**Data:** new `lib/api/taxonomy.ts` mirroring `apps/etl/src/taxonomy/taxonomy.service.ts` shape (hand-mirrored per [ADR-0005](../decisions/0005-vercel-for-frontend.md)). Endpoints used: `coverage()`, `queue(type, limit)`, `node(id)`, `fuzzyMatches(id)`.

Read-only: no status / alias edit actions. Drawer footer reads "moderation actions land in Phase 2 — see [taxonomy-curation](./taxonomy-curation.md)".

## Data viz primitives

Three custom SVG components, no chart library:

- `<Sparkline points: number[] height={24} stroke />` — inline ~120×24px line chart; theme-aware stroke via CSS var; renders nothing (returns `null`) for fewer than 2 points.
- `<StackedBar segments={[{value, label, color}]} total? showLabels />` — horizontal stacked bar; segments below 4% width drop their label to avoid overflow.
- `<Donut value total label />` — small SVG donut for "fully verified" KPI; centered numeric label.

All three live at `components/data/` (tier 2, see [`apps/web/CLAUDE.md`](../../../apps/web/CLAUDE.md)). All accept theme tokens (`var(--color-accent)` etc.) — no hard-coded colors. No client JS unless tooltip is hovered (use CSS `:hover` + native `<title>` for v1).

If we later want brush/zoom/heatmap, swap in `visx` per chart, not as a global dependency.

## Files & tier discipline

```
apps/web/
  app/(investigation)/
    layout.tsx                          [NEW]
    _components/
      Sidebar.tsx                       [NEW]  group-private
      InvestigationHeader.tsx           [trim]
    dashboard/
      page.tsx                          [renamed from monitoring/]
      _components/
        KpiCard.tsx                     [NEW]
        ActivityStream.tsx              [NEW]
        ActivityRow.tsx                 [NEW]  one ingest → records → vacancies row
        FailedIngestsDrawer.tsx         [NEW]
        StatsOverview.tsx               [moved from monitoring/_components]
        LatestPerSource.tsx             [moved + sparkline injected]
    sources/
      page.tsx                          [NEW]
      _components/
        SourcesTable.tsx                [NEW]
    taxonomy/
      page.tsx                          [NEW]
      _components/
        CoveragePanel.tsx               [NEW]
        AxisBar.tsx                     [NEW]
        VerifiedDonut.tsx               [NEW]
        BucketHistogram.tsx             [NEW]
        QueueTabs.tsx                   [NEW]
        QueueRow.tsx                    [NEW]
        NodeDrawer.tsx                  [NEW]
        FuzzyMatchList.tsx              [NEW]
  components/
    data/                               [NEW dir, tier 2]
      Sparkline.tsx
      StackedBar.tsx
      Donut.tsx
  lib/
    api/
      taxonomy.ts                       [NEW]
```

**Tier check:**

- `Sparkline / StackedBar / Donut` — used by 2+ pages → `components/data/` ✓
- `Sidebar` — used only inside `(investigation)` → group-private `_components/` ✓
- `KpiCard / ActivityStream / NodeDrawer / …` — page-private; promote per rule of three.
- `IngestsTable / RecordsFilters` from current `monitoring/_components/` are **not migrated** — they belonged to list pages we are not building. Keep them git-removed during P2.
- `StatsOverview / LatestPerSource` from current monitoring move to `dashboard/_components/`.

## Phasing

The work splits into 3 deliverable PRs (each shippable on its own):

**P1 — Shell.** Sidebar, group `layout.tsx`, route rename + redirect, header trim. No new pages yet — `/dashboard` is the existing monitoring contents under the new shell. `/vacancies` is left in `(investigation)` until [`vacancy-lineage.md`](./vacancy-lineage.md) P1 picks it up.

**P2 — Dashboard recompose + sources page + viz primitives.** Replace the kitchen-sink dashboard with KPI strip + Latest-per-source + Activity stream. Add `/sources` table. Ship `Sparkline` + `StackedBar` + `Donut` primitives. Drop the old `IngestsTable` / `RecordsFilters` components (git-remove).

**P3 — Taxonomy.** New `lib/api/taxonomy.ts` + `/taxonomy` page (coverage + queue + drawer).

Each PR is reviewable in <60 minutes.

**Sequencing with [`vacancy-lineage.md`](./vacancy-lineage.md):** lineage P1 (lift `/vacancies` to public) should land before this tracker's P2, so the activity stream's `→ N vacancies` link points to a page already living under the public chrome. If lineage P1 slips, ship P2 with the link pointing to the still-investigation `/vacancies` and rewire when lineage P1 lands.

## Open questions / decisions

- **D1 — Sparkline data source.** `monitoringApi.stats()` returns aggregate-only counts. Two options for v1:
  - (a) Render the sparkline from the last 7 ingests' status sequence (already on the dashboard data) — fast, no backend change, less informative.
  - (b) Add a `/monitoring/timeseries?days=7` endpoint returning `[{day, ingests, records, failed}]`.
  - **Lean (a) for P2; revisit if v1 feels thin.**
  - **P2 (shipped):** option (a). Two sparklines on the KPI strip: ingests = last 7 statuses mapped `completed=1 / running=0.5 / failed=0`; records = recordCount of those same 7 ingests. Per-source card sparkline uses the same status mapping over the source's last 7. Stroke flips to `--color-danger` when any of the 7 was `failed` (visual signal without changing the mapping).
- **D2 — Filters needed by activity-stream / taxonomy drill-ins.** `ListVacanciesQuery` has `roleId` but no `domainId` and no `fromIngest`. Three options for the activity-stream "→ N vacancies" link:
  - (a) Add `fromIngest` to the contract + service.
  - (b) Land the activity stream linking to `/ingests/:id` only and let the user drill from there.
  - (c) Render the count without a link until (a) ships.
  - **Pick before P2 ships.** Same call also resolves DOMAIN tab in `/taxonomy`.
  - **P2 (shipped):** blend of (b) and (c). Activity-stream rows show `time · status · source · ingest #abc → N records`; both clickable cells link to `/dashboard/ingests/:id` (still under operator chrome until vacancy-lineage P1 lifts it). The `→ N vacancies` segment is omitted entirely until D3 lands the count and D2 lands `fromIngest`. DOMAIN tab in `/taxonomy` (P3) likewise renders the "used by N vacancies" line without a link.
- **D3 — Per-ingest vacancy count.** `IngestListItem` carries `recordCount` and `extractedCount` but not "vacancies produced". Options: extend the list endpoint with a `vacancyCount` field (cheap join), or fan out one query per ingest in the activity stream (N+1, fine at N=10). **Lean: extend the list endpoint** since it's a one-line SQL change.
  - **P2 (shipped, deferred for code):** the activity stream omits the `→ N vacancies` segment until the backend lands `vacancyCount` on `IngestListItem`. Frontend types are ready — when the backend extension ships, `ActivityRow` adds the third arrow and a link target in one change. No N+1 fan-out; not worth the round-trips for a value the backend can compute in one join.
- **D4 — Mobile sidebar.** Drawer-style hamburger or full-page sheet? Default to drawer; revisit when first mobile session happens.
- **D5 — Stage 05 roadmap copy.** Roadmap currently says "admin UI in `apps/web`" is out of scope for Stage 05. Update wording to "moderator write-path admin UI is out of scope; read-only operator dashboard ships as Phase 1.5 of taxonomy-curation."
- **D6 — Curation-progress timeseries.** D1's pipeline-health sparkline (last-7-runs status sequence) does not answer "are we curating faster than we extract?" — that needs a separate weekly timeseries of `verified-%` per axis and `fully-verified vacancies / total`. Two options:
  - (a) Snapshot `taxonomy.service.getCoverage()` into a `coverage_snapshots` table on a daily cron, render a 12-week sparkline on `/dashboard` and per-axis trend on `/taxonomy`.
  - (b) Defer until manual moderation actually lands (Phase 2) — the trend is only meaningful once moderators are pushing nodes from NEW → VERIFIED at a measurable cadence.
  - **Lean (b) for v1; reopen when Phase 2 ships.** The numbers don't move on their own.
- **D7 — Per-source `% skill-verified`.** Required by the new `/sources` quality column. `taxonomy.service.getCoverage()` already groups skill-verified by source for the `/taxonomy` per-source breakdown table; expose the same aggregate on `monitoringApi.sources()` (or via a new `sources/coverage` slice) so `/sources` does not have to call two APIs. Either way: backend addition, not a frontend-only change. **Pick before P2 ships** (same gate as D2 / D3).
  - **P2 (shipped, no backend change):** `/sources` calls both `monitoringApi.sources()` and `taxonomyApi.coverage()` and joins `bySource[].pct` by source `code` client-side. Slightly redundant network — both endpoints come back fast — but unblocks the column without touching the backend. If the join cost ever shows up (it won't at N=2), fold the slice into `monitoringApi.sources()` per the original lean.

## Risks

- **R1 — Refactor regressions on `/monitoring`.** The biggest move is recomposing `MonitoringPage`. Mitigation: P1 lands the shell with the existing page intact under `/dashboard`; P2 rebuilds it.
- **R2 — `next.config.ts` redirect ordering.** If a future `/monitoring/anything` is genuinely wanted, the wildcard catches it. Audit before P1 lands.
- **R3 — Bundle size.** Sidebar + 3 SVG primitives — all server-rendered, no client JS unless interactive. Should stay flat. Verify with `next build` analyzer after P2.
- **R4 — Cross-tracker sequencing drift.** Activity-stream links assume lineage P1 has shipped (so `/vacancies` is public). If lineage slips, links still resolve — just with operator chrome until the move. Not blocking.

## Cross-links

- ADR-0005 — [`Vercel for frontend`](../decisions/0005-vercel-for-frontend.md) (no shared `libs/contracts/` until 2nd consumer; web hand-mirrors backend types).
- [`roadmap`](../../roadmap.md) — Stage 05 closed 2026-05-08; this tracker is the Stage 06 entry surface. Update the roadmap copy when P1 ships.
- [`vacancy-lineage`](./vacancy-lineage.md) — sibling tracker. Public detail pages for `/vacancies/:id`, `/records/:id`, `/ingests/:id` live there. The activity stream and KPI drawers in this tracker link INTO those pages.
- [`taxonomy-curation`](./taxonomy-curation.md) — backend Phase 1; this tracker is its Phase 1.5 frontend.
- [`vacancies-api`](./vacancies-api.md) — F4 backend filter gap drives D2 above; F8 facet UI item is fulfilled by [`vacancy-lineage`](./vacancy-lineage.md) P5, not here.
- [`baml-extraction-prompt-tuning`](../../../todo/baml-extraction-prompt-tuning.md) — the Stage 06 lever that bends the SKILL-backlog KPI down; surfaced from the taxonomy-queue card in `/dashboard`.
- Frontend conventions — [`apps/web/CLAUDE.md`](../../../apps/web/CLAUDE.md) (3-tier rule, layout, dev scripts).
