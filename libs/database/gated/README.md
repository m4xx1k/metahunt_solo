# Gated SQL — written, reviewed, deliberately NOT applied

Files here are **not migrations**. Nothing runs them: not `pnpm db:migrate`, not Railway's
`preDeployCommand`, not the CI testcontainer. They live outside `libs/database/migrations/` precisely so
that the migrations folder contains only files that will run.

A file lands here when the SQL is understood but the decision behind it is not made. When the decision is
made, **regenerate it** with `pnpm db:generate` so it enters `meta/_journal.json` like anything else —
do not move the file back by hand.

`pnpm db:check` enforces the folder/journal agreement that makes this work.

## Current contents

### `0039_subscriptions_user_id_not_null_after_approved_cleanup.sql`

Sets `subscriptions.user_id NOT NULL`. Written 2026-08-04, never applied in any environment.

Blocked not by process but by data. Production inventory, 2026-08-07:

- 33 of 50 subscriptions (66%) have `user_id IS NULL`; 22 are active and **24 received a digest in the
  last 14 days**, against 9 owned active subscriptions.
- **0** of them can be backfilled — none has a matching Telegram auth identity, because the deep-link
  flow (`?start=<id>`) creates a subscription with no web account at all. That is the documented design.
- Applying the constraint would require deleting them, cascading 3 574 notifications and 1 080 deliveries.

So this is a product decision — "every subscriber must register first" — not a cleanup. The current
product says the opposite, and Telegram-only subscribers are the majority of the live audience.

Reopen via the product question, not this file. Full inventory and reasoning:
[`md/journal/migrations/canonical-vacancy-grain.md`](../../../md/journal/migrations/canonical-vacancy-grain.md#0039-inventory--production-read-only-2026-08-07-aggregates-only-no-pii) ·
release gate: [`md/journal/product-analytics-v2-release-gates.md`](../../../md/journal/product-analytics-v2-release-gates.md)
