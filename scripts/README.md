# `scripts/`

**Operator tools only.** Something lives here if you will run it again. A script that exists to be run once does not earn a permanent home — it gets deleted the moment it has done its job, and the journal entry that records the change is what preserves the knowledge. `git log` still has the code if it is ever needed again.

The failure mode this rule exists to stop: a directory of scripts nobody dares delete because nobody remembers whether they already ran. Every file below states which side of the line it is on.

## What is here

| Script                           | Why it stays                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prod-db-url.sh`                 | credential provider — prints the prod URL to stdout so any CLI can be pointed at prod without the secret landing in a file or shell history                                    |
| `db-backup.sh` / `db-restore.sh` | run before and after anything destructive                                                                                                                                      |
| `dev-stop.sh`                    | local dev (`pnpm dev:stop`)                                                                                                                                                    |
| `seo-audit.ts`                   | repeatable audit (`pnpm seo:audit`) — the SEO contract says run it before touching SEO                                                                                         |
| `analytics-catalog.ts`           | drift guard (`pnpm analytics:catalog`) — fails when an analytics event exists in code but not in the console's catalog, or vice versa                                          |
| `posthog-founder-setup.ts`       | PostHog workspace guard (`pnpm posthog:founder -- --verify` / `--apply`) — verifies or applies MET-114 founder dashboard naming, timezone, transition action, and query access |
| `delete-temporal-schedule.ts`    | ops: removes a schedule after its workflow is renamed or retired                                                                                                               |
| `temporal-schedules.ts`          | pause / resume / list the three installed schedules — required before any migration that mutates taxonomy or vacancies                                                         |

## What a one-shot looks like, and where it goes instead

A one-shot is: a backfill, a data cleanup, a migration of existing rows. It runs, you verify, it goes away.

Prefer this order:

1. **A drizzle migration** if the change is schema or can be expressed in SQL. It is versioned, ordered, and applied exactly once by design.
2. **A seed** under `libs/database/seeds/` if it populates reference data that a fresh environment also needs.
3. **A plan-driven driver** if the same _shape_ of operation will recur — the driver is a tool and stays, the plan is data and gets archived. `apps/etl/src/admin/taxonomy/taxonomy-migrate.cli.ts` is the example: the CLI is permanent, each `plans/*.plan.json` is a one-shot that moves to `plans/_done/` once applied.
4. **A script here, then deleted** only if none of the above fit.

Whichever you pick: dry-run by default, `--apply` to mutate, and record the run in `md/journal/`.

## Retired

Deleted after doing their job. Listed so nobody wonders whether the work happened.

| Script                      | Did                                                                                                                                                                                                                                                | Recorded in                                                                           | Removed    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| `cleanup-nontech.ts`        | re-ran the fixed tech gate over stored rows, deleted 19 junk prod vacancies                                                                                                                                                                        | `md/journal/migrations/_done/tech-filter-implementation.md`, `md/journal/releases.md` | 2026-07-27 |
| `backfill-company-slugs.ts` | re-slugged companies whose slug was empty or not URL-safe (Cyrillic names collapsed into one row). Verified complete: 0 companies without a slug                                                                                                   | `md/journal/releases.md`                                                              | 2026-07-27 |
| `backfill-tg-usernames.ts`  | resolved `tg_username` / `tg_first_name` via the Telegram `getChat` API for subscriptions linked before capture existed. Done as far as it can go — 3 rows stay null because those chats are unresolvable, which the script documented as expected | `md/journal/releases.md`                                                              | 2026-07-27 |
