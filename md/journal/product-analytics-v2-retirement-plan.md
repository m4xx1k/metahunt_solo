# Analytics v2 — staged retirement plan

The legacy PostHog project, `analytics_journeys`, `analytics_outbox`,
`product_events`, and their workers are archive-only until the agreed v2
observation window finishes. They must not be deleted, rewritten, or mixed
with v2 reporting during that window.

## Stages

1. **Cutover and observation (current).** Use the dedicated v2 project for
   Contacts and founder dashboards. Keep archive keys and legacy tables
   read-only for comparison. Record v2 cutover timestamp and dashboard links.
2. **Evidence review.** After the owner-approved observation window, compare
   the documented v2 events and dashboard totals with a dedicated test account.
   Confirm no production code writes the archive ledger/outbox path.
3. **Reviewed retirement migration.** Pause notification schedules, take and
   restore-test a backup, remove application callers and workers, then delete
   archive tables/columns only in separately reviewed migrations. Do not mix
   this migration with `subscriptions.user_id NOT NULL`.
4. **Post-retirement.** Retain the old PostHog project read-only for the
   agreed data-retention period, then remove its credentials through the
   secret manager and document the deletion authorization.

Each stage requires owner sign-off, before/after counts, migration identifiers,
and rollback evidence. A rollback restores application configuration and the
tested database backup; it never attempts a PostHog identity merge or rewrite.
