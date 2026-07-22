# Analytics ledger implementation checkpoint

**Recorded:** 2026-07-22  
**Branch:** `feat/analytics-ledger-dashboard`  
**State:** implementation and full local validation green; all clean-agent P0-P2
findings resolved; final post-outbox review running; no PR, merge, or production
deployment yet.

## Implemented

- Migration `0029` adds `analytics_journeys`, `product_events`,
  `subscriptions.journey_id`, `linked_at`, and `deactivated_at`.
- Existing subscriptions backfill as `legacy_subscription`; known Telegram auth
  identities link the concrete subscription to the internal account without
  assigning a permanent account owner to a shared browser journey or fabricating
  product events.
- A browser-local pseudonymous journey UUID is included in critical browser events
  and subscription creation. API, Telegram activation, preview, digest, click, and
  unsubscribe events reuse it.
- PostgreSQL is the correctness ledger; product mutations enqueue events in a
  transactional outbox, and a retrying dispatcher copies them to `product_events`
  before PostHog receives the same journey ID. Telegram IDs, account IDs, filters,
  CV content, and raw errors are not event properties.
- Public event ingestion is rate-limited, Zod-validated, property-allow-listed,
  time-bounded, and idempotent.
- Browser storage, dispatcher, and PostHog failures are contained outside the main
  subscription/delivery flow; critical business mutations atomically enqueue their
  evidence in the same PostgreSQL transaction.
- Admin-only `GET /admin/product-analytics/overview` and `/product-analytics` show
  radar-cohort reach, subscription/delivery state, legacy/account joins, integrity
  gaps, and recent pseudonymous journeys.
- Shared helpers/types now live under `platform/shared`, feature contracts,
  subscription types, and `web/lib`; taxonomy query/page parsing was removed from
  controllers and route pages, and HTTP UUID/body validation uses Nest pipes/DTOs.
- Account pause/resume keeps `deactivated_at` aligned and emits lifecycle events;
  redirect and observational analytics remain detached, while subscription,
  Telegram, pause/resume, and final digest evidence uses the transactional outbox.

## Verified

- database, ETL, and web production builds pass;
- ETL and web lint pass;
- ETL unit: 63 suites / 346 tests;
- web unit: 5 suites / 54 tests;
- PostgreSQL integration: 11 suites / 41 tests;
- ledger integration proves one journey across browser/API/Telegram/worker and
  idempotent browser retry handling;
- Railway production is healthy;
- owner-observed Backend radar reconciled in production: created and linked at
  `2026-07-22 10:38:50 UTC`, preview matched, and the `11:30 UTC` digest delivered
  four vacancies. This predates `0029`, so it will remain truthful legacy evidence.

## Mandatory gates before PR

1. Finish the clean-memory agent review and resolve every P0-P2 finding.
2. ✅ Grep all changed and adjacent controller/service/page files for general parsing,
   UUID, time, formatting, mapping, and duplicated type helpers.
3. ✅ Prefer Nest pipes/DTOs at controller boundaries; keep reusable predicates and
   parsers in `platform/shared`; remove manual service validation where inputs can be
   typed/validated earlier without weakening defense in depth.
4. ✅ Clean the existing `apps/web/app/(investigation)/taxonomy/page.tsx` helper pile by
   moving generic URL/query parsing into the appropriate shared/API boundary, while
   keeping route-specific composition local.
5. ✅ Re-run diff review, `git diff --check`, lint, all tests, integration tests, and all
   builds. Confirm no noisy/generated/unrelated changes.
6. Update this checkpoint/tracker with review findings and exact final validation.

## Release plan

1. Create a reviewable PR only after the gates above.
2. Merge after CI passes.
3. Railway deploy runs migration `0029` in pre-deploy; verify migration, health,
   replica, logs, and aggregate dashboard query.
4. Verify Vercel production and `/product-analytics` with an admin session.
5. Run one new controlled Backend-radar chain to prove a non-legacy journey across
   browser, API, Telegram, preview, and scheduled digest. Do not invent browser events
   for the already-completed legacy run.
6. Record production evidence and rollback notes in the tracker/release journal.

## Current review state

The clean-agent passes found blocking analytics awaits, misleading independent
event reach, single-owner browser journey attribution, incomplete pause/resume
lifecycle semantics, unclassified controlled tests, a best-effort ledger, and
adapter-bound ports. All are addressed: the dashboard uses an ordered seven-day
funnel, test populations are explicit, ports own their contracts/tokens, and a
transactional outbox retries durable delivery. Multi-page retries also preserve the
original digest envelope, distinguish total matches from the capped planned delivery
set, and derive first-digest state from completed delivery evidence. One final review
of that envelope delta remains the last pre-PR code gate.
