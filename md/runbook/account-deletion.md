# Account deletion

## User path

`/me` → **delete my account** → type `DELETE` → permanent deletion. The web
client drops its local Bearer token and returns to `/` after the API confirms.

The API boundary is authenticated `DELETE /me`. It locks the account row and
performs one transaction:

1. Read the account's Telegram identities and owned candidate IDs.
2. Delete every subscription for those Telegram chats, including cold alerts
   created before login.
3. Delete the user. Database cascades remove auth identities, owned
   subscriptions, `user_cvs`, and their `sent_notifications` rows.
4. Delete derived user candidates that have no remaining legacy owner, plus any
   legacy subscriptions that still reference them.

Migration `0028_far_chronomancer.sql` makes both required database guarantees:

- `subscriptions.user_id → users.id ON DELETE CASCADE`;
- `sent_notifications.subscription_id → subscriptions.id ON DELETE CASCADE`.

Seeded sample candidates are never deleted by the account path. A legacy
candidate shared through another `user_cvs` row is retained for that owner.

## Session and abuse boundary

`JwtAuthGuard` resolves account existence and current roles from Postgres after
signature verification. A deleted account's old 30-day token therefore returns
`401`; stale admin roles are also rejected. Telegram login is limited to ten
attempts per IP per minute on top of the global API limit.

## Retention behavior

- Raw CV text is not persisted after extraction.
- Unlinked pending Telegram subscriptions are purged after 48 hours.
- Active account state, derived CV data, subscriptions, and notification
  history remain until the user deletes the item or account.
- PostHog receives opaque subscription IDs, not account, Telegram, email, CV,
  or filter values. Account deletion therefore has no PostHog person identity
  to erase from this application boundary.

Provider logs, backups, legal-controller wording, and analytics consent remain
owner/legal decisions; do not promise deletion from provider infrastructure
without that review.

## Verification

```bash
pnpm --filter @metahunt/etl exec jest \
  --config jest.int.config.ts --runInBand test/int/me.int.spec.ts
pnpm --filter @metahunt/etl exec jest \
  src/account/me.controller.spec.ts \
  src/platform/auth/jwt-auth.guard.spec.ts --runInBand
```

The integration fixture applies real migrations to ephemeral Postgres and
proves deletion of identity, CV data, owned and same-chat subscriptions, and
notification history while preserving unrelated users and legacy co-owned CVs.

If production deletion fails after deploy, first confirm migration `0028` ran.
Do not issue manual production deletes until the requested account and scope
are verified with the owner.
