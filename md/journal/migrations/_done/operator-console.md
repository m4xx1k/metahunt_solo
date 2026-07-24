# Operator console rework

**Branch:** `feat/operator-console`
**Status:** shipped
**Scope:** frontend only (`apps/web`). No backend, no product surface.

## Why

The operator UI had grown into a route group (`app/(investigation)`) whose URLs leaked
out at the top level — `/product-analytics`, `/sources`, `/taxonomy`, `/vacancies`,
`/unique-vacancies` — with only `/dashboard` under an actual prefix. Screens repeated
their own KPI card, panel, table and section markup; the analytics screen was one
578-line client component that fetched everything through react-query and kept period,
population and tab selection in `useState`, so nothing was linkable. There was no 404
page at all.

## What changed

**One guarded subtree.** Everything protected now lives under `/dashboard/*`:

| Before | After |
|---|---|
| `/dashboard` | `/dashboard` (Overview) |
| `/product-analytics` | `/dashboard/analytics` |
| `/dashboard/extraction` | `/dashboard/costs` |
| `/sources` | `/dashboard/sources` |
| — (activity lived on the dashboard) | `/dashboard/runs` (+ `?tab=failed`) |
| `/dashboard/ingests/[id]` | `/dashboard/runs/[id]` |
| `/vacancies` | `/dashboard/vacancies` |
| `/unique-vacancies` | `/dashboard/dedupe` |
| `/taxonomy` | `/dashboard/taxonomy` |

Old paths are permanent redirects in `next.config.ts`. `robots.ts` disallows just
`/dashboard` + `/me` now.

**Overview is widgets, not a wall.** Five drill-down tiles (gold, silver, merged, llm
spend, failed runs) over two funnel panels (ETL + activation) over three health panels
(sources, taxonomy, dedupe) over recent runs. Every tile and every panel footer links to
the screen that explains it. The old page's per-source N+1 (`sources.map(listIngests)`
for sparklines) is gone from the overview — it stays on `/dashboard/sources`, where
sparklines are the point.

**Tabs instead of scroll, state in the URL.** `ui/navigation/UrlTabs` keeps the active
tab in `?tab=` and commits it with `history.replaceState`, so switching costs no server
round-trip (all panels are already server-rendered) but the URL stays shareable. Used by
Analytics (funnel/subscribers/identity/journeys), Costs (prompts/models/recent) and Runs
(all/failed). Anything that changes what the server fetches — period, population, search —
goes through `ui/navigation/UrlSegments` / `ui/inputs/UrlSearch`, which do a real
`router.replace`.

**Analytics is a server component again.** The 578-line client monolith became a page
that fetches once server-side plus four panels; only the journey test/production toggle
stayed client-side (`JourneyActions`, `router.refresh()` after the PATCH). Period and
population are URL params, so a link can point at exactly one view.

**A shared kit, promoted per the second-consumer rule.**
`ui/layout/{PageHeader,PageBody,Panel}`, `ui/data/{StatCard,StatGrid,StatRows,MeterRow,DataTable}`,
`ui/feedback/EmptyState`, `ui/navigation/{UrlTabs,UrlSegments,PanelLink,BackLink}`,
`ui/overlay/InfoHint`, `ui/inputs/{FilterToggles,UrlSearch}`. Deleted in favour of it:
`KpiCard`, `MetricCard`, three copies of a `Panel`, two `Stat`/`Row` pairs, four
hand-written tables, `InvestigationHeader`, `PeriodSelector`, `DashboardTabs`,
`FailedIngestsDrawer` (now the Runs failed tab), `FunnelWidget`, `TaxonomyHealth`,
`DedupQualityWidget`, `LatestPerSource`, `ActivityStream`/`ActivityRow`, `MetricsPanel`.
Cross-screen domain pieces went to `entities/`: `ingest/{StatusBadge,RunRow}`,
`rss-record/RssRecordCard`, `analytics/event-labels`.

**Chrome.** One `app/dashboard/layout.tsx` owns the guard, the sidebar and `<main>`;
screens render `PageHeader` + `PageBody` and nothing else. The sidebar is icon + one-word
label, grouped Overview / Product / Pipeline / Data, with the nav declared once in
`_components/nav.ts`.

**404s.** `app/not-found.tsx` (public) and `app/dashboard/not-found.tsx` (renders inside
the console shell, so the sidebar survives a bad record id).

**Language.** Console UI is English throughout — short labels, one hint line per screen,
captions in mono uppercase. The product surface (feed, landings) was not touched.

## Notes / gotchas

- `react-hooks/set-state-in-effect` is enforced: URL-derived state must be *derived*, not
  mirrored into `useState` inside an effect. `UrlTabs` reads `useSearchParams` directly;
  `UrlSearch` keeps the input uncontrolled and keys it on the committed term.
- Radix `Tabs.List` and `Tabs.Content` live in different subtrees (header vs body) under
  one `Tabs.Root` that wraps the whole screen — context, so depth doesn't matter.
- The root feed route is an optional catch-all, so an unknown `/dashboard/zzz` is matched
  by the *feed* page (which 404s on an unknown track slug) rather than the console's
  `not-found.tsx`. The console 404 is what `notFound()` inside a console page hits.
- Verified: `tsc --noEmit`, `eslint`, `next build`, `jest`, and a `next start` smoke pass
  over every redirect + the no-session bounce. The authed screens were not rendered
  locally (no ETL backend, no admin session) — the Vercel preview is the visual check.
