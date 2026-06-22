# taxonomy-workspace — split-pane curation surface

**Branch:** `feat/taxonomy-workspace`
**Status:** done
**Started:** 2026-05-24 · **Closed:** 2026-05-24

## Outcome

`/taxonomy` is now a split-pane workspace (filters + list + always-on detail panel) backed by two new endpoints: `GET /admin/taxonomy/nodes` (unified, paginated, filterable across type / status / search / blocked) and `PATCH /admin/taxonomy/nodes/:id/rename` (transactional, 409 with `suggestion.mergeTargetId` on conflict). Filters and the selected node id are URL-driven, so deep-links and history work. Legacy `GET /queue` and the `NodeDrawer` modal flow were deleted. `pnpm test:etl` 146/146 green (5 new specs); `pnpm lint:web` clean; `pnpm build:web` clean. Bulk actions, keyboard nav, and an activity log were scoped out.

## Subtasks

- [x] T0 — branch + tracker
- [x] T1 — backend: `GET /admin/taxonomy/nodes` + `PATCH /admin/taxonomy/nodes/:id/rename`; legacy `GET /queue` removed
- [x] T3 — web API client: `NodeListFilters` / `NodeListResult` types + `taxonomyApi.list` / `taxonomyApi.rename`; `TaxonomyApiError` for typed 409 handling; `taxonomyApi.queue` removed
- [x] T4 — workspace split-pane: `page.tsx` rewritten as Server Component reading `searchParams`; new `_components/` (AnalyticsStrip, Filters, NodeList, NodeRow, ListPagination, DetailPanel, ModerationActions, AliasList, VerifiedSearch) + `FuzzyMatchList` rewritten as Client; `_hooks/useUrlState.ts`; `QueueTabs`, `QueueRow`, `NodeDrawer`, `CoveragePanel`, `BucketHistogram` deleted
- [x] T6 — backend tests: `taxonomy.service.spec.ts` (3 `listNodes` + 6 `renameNode` cases) + `taxonomy.controller.spec.ts` (list parse / rename happy / validation)
- [x] T7 — docs + close: `md/architecture/overview.md` updated; `md/journal/releases.md` paragraph added under 2026-05-24

## Decisions

- **No activity log.** Considered an `node_activity` table for an "5 last actions" strip on top of the workspace; rejected — the workspace is dashboard-shaped (live coverage numbers), an action log adds noise without adding history. A separate PR can pick it up if it ever pays off.
- **No bulk operations / no keyboard nav.** The "Linear-style" original plan included multi-select + bulk actions + `j/k/v/h/r` shortcuts. Cut entirely: scope is single-row moderation, queue size is small, and adding it doubles the workspace code (`useSelection`, `useKeyboardNav`, `BulkActionsBar`, `POST /bulk`). The split-pane / persistent-detail UX still pays its rent without them — closer to Apple Mail / Inoreader than Linear.
- **Drop legacy `GET /admin/taxonomy/queue`.** The new `GET /nodes` is a superset (mixed types + statuses + search + blocked filter + pagination). The UI is the only consumer; deleting the dead endpoint in the same PR keeps the surface area honest.
- **Rename conflict carries `suggestion.mergeTargetId`.** A 409 on rename is the natural moment to route the operator into the merge flow — the alternative (a dead-end error toast) costs the operator a context switch back to the list to find the conflicting node by hand. The UI consumes the suggestion by setting `?selected=<mergeTargetId>`.
- **Detail panel is a Server Component.** With `?selected=<id>` in the URL the route is already dynamic; making the panel a Server Component with `Suspense` keeps fetching off the client and lets `router.refresh()` from action mutations re-fetch detail + list in one render pass.

## Links

- Stage: `md/roadmap.md` Stage 06
- Prior taxonomy work: `md/journal/migrations/taxonomy-curation.md`
- PR: —
