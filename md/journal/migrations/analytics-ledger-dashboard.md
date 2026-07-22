# analytics-ledger-dashboard — First-party funnel evidence

**Branch:** `feat/analytics-ledger-dashboard`
**Status:** implementation complete, pre-PR review
**Started:** 2026-07-22

## Outcome

MetaHunt now has a first-party, privacy-bounded activation ledger. A stable
browser journey UUID crosses subscription creation, Telegram activation, preview,
scheduled digest, click, and unsubscribe events. PostHog receives the same journey
identity as a secondary analysis sink, while PostgreSQL remains the correctness
source. The admin-only `/product-analytics` workspace exposes the funnel, current
subscription state, legacy coverage, subscription-derived account joins, integrity gaps, and
recent pseudonymous journeys.

## Subtasks

- [x] T0 — Add pseudonymous journeys and a durable event ledger — _done when:_
      existing subscriptions migrate safely and new subscriptions carry a journey id.
- [x] T1 — Join browser and server events without relying on PostHog alias — _done
      when:_ landing, subscription, Telegram, digest, click, and stop events share one
      first-party journey id.
- [x] T2 — Add operator aggregation and integrity APIs — _done when:_ conversion,
      legacy coverage, broken chains, and recent journeys are queryable without PII.
- [x] T3 — Add an admin-only product funnel dashboard — _done when:_ the existing
      operator workspace renders funnel, identity health, delivery, and journey rows.
- [ ] T4 — Verify compatibility and release readiness — _done when:_ unit,
      integration, lint, builds, migration checks, and production reconciliation pass.

## Decisions

- The ledger stores only critical business events; PostHog remains the exploratory
  UI/session analytics sink.
- Old subscriptions receive legacy journeys without fabricated historical events.
- Missing browser journey input never blocks subscription creation.
- Existing Telegram-authenticated subscriptions backfill their internal `user_id`
  when the identity already exists; Telegram IDs never enter the event ledger or
  PostHog properties.
- Client storage, dispatcher, and PostHog failures are contained. Critical business
  mutations enqueue ledger evidence in their existing PostgreSQL transaction.
- Browser journeys are device/session correlation keys, not account owners. Account
  aggregation is derived from owned subscriptions, so a shared browser cannot pin
  later activity to the first account that used it.
- Business mutations and their analytics evidence commit through a transactional
  outbox. A retrying, multi-replica-safe dispatcher materializes `product_events`;
  PostHog remains secondary and cannot block product behavior.
- Funnel conversion is ordered per journey and capped at seven days from landing.
  Production excludes controlled tests by default; operators can classify journeys
  and inspect `production`, `test`, or `all` populations separately.
- `digest_deliveries` preserves the original first-digest/count/page/delivery-ID
  envelope and page progress, so partial Telegram retries cannot rewrite analytics
  identity or classify a retry as a later digest. Total matches and the capped
  planned delivery set are stored separately, so `total > items.length` still
  completes truthfully.

## Verification

- database, ETL, and web production builds pass;
- ETL and web lint pass;
- ETL unit: 63 suites, 346 tests;
- web unit: 5 suites, 54 tests;
- PostgreSQL integration: 11 suites, 41 tests;
- the ledger integration proves browser/API/Telegram/worker events share one
  journey and browser retry deduplication works;
- production Railway state is healthy; the observed 2026-07-22 Backend radar was
  created and linked at 10:38 UTC, then received four new vacancies at 11:30 UTC;
- production deployment of this branch and one post-deploy tracked journey remain
  release steps, not pre-PR evidence.

## Links

- Parent funnel tracker: [`real-user-funnel.md`](real-user-funnel.md)
- Measurement runbook: [`../../runbook/first-user-funnel.md`](../../runbook/first-user-funnel.md)
- Baseline: [`../../analysis/2026-07-22-production-status-and-next-steps.md`](../../analysis/2026-07-22-production-status-and-next-steps.md)
