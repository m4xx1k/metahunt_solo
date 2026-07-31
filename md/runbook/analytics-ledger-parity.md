# Analytics ledger parity gate

Do not delete `analytics_outbox` or `product_events` until a production window
proves that PostHog receives the behavioural facts needed to replace their
analytics role.

## What remains first-party truth

- accounts and provider links;
- subscriptions, criteria, current activation/deactivation state;
- delivery envelopes, notification deduplication, and retry state;
- the transactional outbox while server-side delivery needs guaranteed handoff.

Those are operational facts, not a behavioural dashboard.

## Parity window

For 14 consecutive production days, compare the same half-open Kyiv intervals
`[from, to)` in both systems. Record the result in the MET-114 tracker before
changing retention or deleting a table.

| Behaviour | Postgres temporary comparator | PostHog canonical event |
|---|---|---|
| Landing / entry | `landing_view` | `page_viewed` |
| Feed outbound | `apply_clicked` | `vacancy_outbound_clicked` + `surface=web_feed` |
| Digest outbound | `digest_link_clicked` | `vacancy_outbound_clicked` + `surface=telegram_digest` |
| Activation | `telegram_linked` | `telegram_linked` |

Investigate a difference above 2% or any unexplained identity split. A failed
comparison resets the 14-day window; it is not a reason to discard the ledger.

## Rollback

The migration is additive. If PostHog delivery or identity stitching regresses,
keep the outbox enabled, use the ledger comparator, and fix the producer before
attempting any narrowing again.
