# Analytics v2 release gates

## Implemented safe boundary

- `POST /subscriptions` and `POST /subscriptions/cv` require an authenticated
  account.
- New subscription rows are written with that account's `users.id`.
- A Telegram `/start` link activates only when its Telegram identity resolves
  to the same account that created the subscription.
- Contacts are sourced from `users` only; PostHog activity is looked up by
  `distinct_id = users.id`, never by PostHog `person_id`.

## Required production gate before the database constraint

Do not apply `subscriptions.user_id NOT NULL` or delete legacy rows until a
fresh, restorable production backup has been reviewed and the release owner
approves the exact output of this read-only query:

```sql
SELECT
  s.id,
  s.is_active,
  s.created_at,
  s.linked_at,
  COUNT(DISTINCT n.id) AS sent_notifications,
  COUNT(DISTINCT d.id) AS digest_deliveries
FROM subscriptions s
LEFT JOIN sent_notifications n ON n.subscription_id = s.id
LEFT JOIN digest_deliveries d ON d.subscription_id = s.id
WHERE s.user_id IS NULL
GROUP BY s.id, s.is_active, s.created_at, s.linked_at
ORDER BY s.created_at, s.id;
```

The release note must record the count, active count, dependent-record counts,
backup checksum, restore proof, reviewer, and before/after totals. Deleting a
subscription cascades only to its dependent notification/delivery history; it
must never delete or fabricate a `users` row. The non-null migration belongs
in a separate reviewed deployment immediately after the approved cleanup.

## Remaining external gates

Creating the new PostHog project, installing its production keys, running a
dedicated-account smoke test, and retiring legacy ledger/outbox tables are
external/reversible milestones. They require project-owner access and an
observation window; they are intentionally not automated by application code.
