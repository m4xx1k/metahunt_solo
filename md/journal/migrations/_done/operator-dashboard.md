# operator-dashboard — internal dashboard for `apps/web`

**Branch:** `feat/operator-dashboard-p3` (stacked over `feat/operator-dashboard` + `-p2`) · **Closed:** 2026-05-09 · **Status:** done

## Outcome

P1+P2+P3 plus two polish rounds shipped via PR #12 (2026-05-09).

✅ Sidebar-driven `(investigation)` group layout with mobile hamburger drawer  
✅ `/dashboard` recomposed: KPI strip (ingests · records · failed · taxonomy queue with per-axis breakdown) + latest-per-source with inline 7-run sparkline + activity stream  
✅ `/sources` table: per-source health with `% skill-verified` joined client-side from `taxonomyApi.coverage().bySource` (D7, no backend change)  
✅ `/taxonomy` page: axis coverage stacked bars + health pills + fully-verified donut + skill-bucket histogram + queue tabs (ROLE / SKILL / DOMAIN, search, scrolling list) + node drawer with fuzzy matches  
✅ Three SVG primitives at `components/data/`: `Sparkline`, `StackedBar`, `Donut` — theme-token strokes, no chart library  
✅ `/monitoring` 308-redirected to `/dashboard`; old `IngestsTable` / `RecordsFilters` git-removed  
✅ `SeniorityBadge` (5-tone by level) + `CopyButton` (replaces full UUIDs) + location truncation with `+N` overflow (polish round 2)  
✅ Backend touched only for `VacancyDto.rssRecordId` (one column on the existing join)

**Goal:** Replace the kitchen-sink `/monitoring` page with a sidebar-driven operator dashboard inside the existing `(investigation)` route group, and add taxonomy curation UI on top of the read-only `/admin/taxonomy/*` API. Read-only Phase 1.5 of [taxonomy-curation](../taxonomy-curation.md) — moderator write-path is out of scope.

## Out of scope

- Public-facing detail pages for vacancies / records / ingests — handled by [`vacancy-lineage.md`](../vacancy-lineage.md)
- Moderator write actions (status changes, alias edits, merges) — Phase 2; authentication / role gating

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

## Page contracts

### `/dashboard`

- **KPI strip (4 cards):** ingests · records (both with 7-run sparkline) · failed ingests (red badge if > 0, drawer with deep-links) · taxonomy queue (per-axis ROLE/SKILL/DOMAIN breakdown, SKILL amber ≥ 1k / red ≥ 5k).
- **Latest per source:** existing widget with inline 7-run status sparkline injected.
- **Activity stream:** one row per recent ingest — `time · status · source · ingest #abc → N records`; both cells link to `/dashboard/ingests/:id`. `→ N vacancies` segment deferred until D3 lands `vacancyCount` on `IngestListItem`. Last 10 events; no pagination.
- **Data:** `monitoringApi.stats()` + `monitoringApi.listIngests({ limit: 10 })` + `taxonomyApi.coverage()`. Sparklines rendered from last 7 ingest statuses (D1 lean-a, no backend change).

### `/sources`

| Column | Source |
|---|---|
| Code | `source.code` |
| Display name | `source.displayName` |
| Last ingest | `latestPerSource.lastIngestAt` → links to `/ingests/:id` |
| Last status | `latestPerSource.lastStatus` as pill |
| 7-run sparkline | `listIngests({sourceId, limit:7})` |
| 24h records | derived from records list |
| % skill-verified | `taxonomyApi.coverage().bySource` joined by `code` client-side |
| Open | `source.baseUrl` external link |

### `/taxonomy`

Two-pane layout (40 / 60).

**Left — Coverage:**
1. Axis coverage stacked bars (ROLE / SKILL / DOMAIN): segments verified · new · missing; health pill at right edge driven by `% missing` (green < 10%, amber 10–30%, red ≥ 30%). Thresholds as constants in `_components/CoveragePanel.tsx`.
2. Fully-verified vacancies donut + three-step funnel `verified-role → verified-domain → verified-skills ≥ threshold`.
3. Verified-skill bucket histogram: 6 buckets (`100`, `75-99`, `50-74`, `25-49`, `1-24`, `0`).
4. Per-source breakdown table: source code · vacancies · links · % verified.

**Right — Queue:**
- Tabs: ROLE | SKILL | DOMAIN. Rows sorted by `usage_count desc` with inline bar + aliases preview.
- Click → drawer: node detail (id, name, type, status, full aliases, created/updated) + fuzzy matches (`pg_trgm.similarity ≥ threshold`). "Used by N vacancies" line without link until D2 lands `fromIngest` / DOMAIN filter.
- Read-only: "moderation actions land in Phase 2 — see [taxonomy-curation](../taxonomy-curation.md)".
- **Data:** `lib/api/taxonomy.ts` — endpoints `coverage()`, `queue(type, limit)`, `node(id)`, `fuzzyMatches(id)`.

## Data viz primitives

Three custom SVG components at `components/data/` (tier 2 — used by 2+ pages):

- `<Sparkline points: number[] height={24} stroke />` — inline ~120×24px line chart; returns `null` for fewer than 2 points.
- `<StackedBar segments={[{value, label, color}]} total? showLabels />` — segments below 4% width drop their label.
- `<Donut value total label />` — small SVG donut; centered numeric label.

All accept theme tokens (`var(--color-accent)` etc.); no hard-coded colors. No client JS unless tooltip hovered (CSS `:hover` + native `<title>` for v1). If brush/zoom/heatmap needed later, swap in `visx` per chart.

## Open decisions resolved

- **D1 (sparkline data):** lean-a shipped — last 7 ingest statuses (`completed=1 / running=0.5 / failed=0`); stroke flips to `--color-danger` when any run was `failed`.
- **D2 (activity-stream / DOMAIN filters):** blend of (b)+(c) — activity stream links to `/dashboard/ingests/:id`; `→ N vacancies` and DOMAIN "used by N vacancies" link omitted until D3 + `fromIngest` land.
- **D3 (per-ingest vacancy count):** deferred; frontend types ready — when backend lands `vacancyCount` on `IngestListItem`, `ActivityRow` adds the arrow in one change.
- **D4 (mobile sidebar):** drawer-style hamburger shipped.
- **D7 (per-source % skill-verified):** client-side join of `monitoringApi.sources()` + `taxonomyApi.coverage().bySource`.

## Cross-links

- ADR-0005 — [`Vercel for frontend`](../../decisions/0005-vercel-for-frontend.md)
- [`roadmap`](../../../roadmap.md) — Stage 05 closed 2026-05-08; this tracker was the Stage 06 entry surface.
- [`vacancy-lineage`](../vacancy-lineage.md) — public detail pages; activity stream links into those pages.
- [`taxonomy-curation`](../taxonomy-curation.md) — backend Phase 1; this tracker is its Phase 1.5 frontend.
- [`vacancies-api`](../vacancies-api.md) — F4 backend filter gap drives D2; F8 facet UI fulfilled by lineage P5.
- [`extraction-prompt-v2`](extraction-prompt-v2.md) — Stage 06 lever for bending the SKILL-backlog KPI down.
- Frontend conventions — [`apps/web/CLAUDE.md`](../../../../apps/web/CLAUDE.md).
