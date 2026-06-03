# tg-notifications — Telegram vacancy digests

**Branch:** `feat/tg-notifications`
**Status:** in-progress
**Started:** 2026-06-03 · **Closed:** —

## Outcome

*(fill in when closing)*

## Context

A subscription = a saved `list()` filter + a Telegram chat. On a schedule we match
new vacancies for each subscriber and push one digest. Matching reuses the catalog
`list()` — no new matching logic. Full research lives in repo-root drafts:
`tg-notifications-todo.md` (mechanics), `weekend-launch-plan.md` (sequencing + pre-MVP gate),
`analytics-posthog-plan.md` (analytics, deferred).

## Subtasks

- [x] T0 — schema: `subscriptions` + `sent_notifications` — *done when:* migration generated.
      → `libs/database/migrations/0014_material_absorbing_man.sql`. `subscriptions.id` =
      deep-link token = canonical subscriber identity (never key on `chat_id`).
- [x] T1 — `TELEGRAM_BOT_TOKEN` env (optional; empty → poller dormant) — *done when:* env.validation passes.
- [x] T2 — isolated bot module `apps/etl/src/telegram/` — *done when:* typecheck green.
      `TelegramService` (grammy poller lifecycle + `/start`/`/stop`/`/help`, stateless
      `sendMessage`), `SubscriptionsService` (link/deactivate). Skips poller without token.
- [ ] T3 — web "Subscribe": facet UI → POST creates `subscriptions` row (params, inactive) →
      returns `t.me/<bot>?start=<id>` — *done when:* clicking Subscribe yields a working deep link.
- [ ] T4 — `buildWhere` extension: `loadedAfter` + `excludeIds` — *done when:* `list()` accepts both.
- [ ] T5 — `matchNewVacancies` + `sendDigest` activities (HTML-escaped, capped) — *done when:* a seeded sub gets a digest.
- [ ] T6 — `notifySubscribersWorkflow` + Schedule @:15 (register like `RssSchedulerService.ensureSchedule`) — *done when:* live digests fire.
- [ ] T7 — pre-launch gate (see `weekend-launch-plan.md`): 1 replica, `/stop`, dedup re-run, grouping-track guard, dry-run.

## Decisions

- **No stored `since` watermark, and NOT keyed off `rss_ingests`.** `rss_ingests.id` is a
  random uuid (not monotonic) and a vacancy's ingest pointer (`lastRssRecordId`) moves on
  upsert, so it can't serve as a cursor — you'd fall back to a timestamp through two joins.
  Instead: candidate = `loaded_at` within a scan window, correctness = anti-join
  `sent_notifications` (PK guards double-send). This also self-heals the verification-lag gap.
- **Per-subscription `created_at` floor (T4/T5).** Candidate window floor =
  `GREATEST(subscription.created_at, now() - <scan_window>)`. The `created_at` term stops the
  first run from dumping the whole pre-subscription backlog on a new subscriber — they only
  get vacancies that appeared *after* they subscribed. Future: a separate "active vacancies"
  view can show the backlog in-app on demand instead of via notifications.
- **Analytics deferred.** Ship TG first. PostHog is purely additive later (no schema change) —
  `subscriptions.id` is already the future `distinct_id`. See `analytics-posthog-plan.md`.

## Test `/start` locally (after this session)

1. `pnpm db:up` then `pnpm db:migrate` — applies `0014`.
2. Create a bot via @BotFather, put `TELEGRAM_BOT_TOKEN=...` in repo-root `.env`.
3. `pnpm --filter @metahunt/etl build && pnpm --filter @metahunt/etl start`
   (log shows `Telegram bot @<name> polling`).
4. DM the bot `/start` → greeting. To test linking: insert a row and `/start <its id>`:
   ```sql
   INSERT INTO subscriptions (params) VALUES ('{}'::jsonb) RETURNING id;
   ```
   `/start <id>` → "Підписку активовано"; row now has your `chat_id`, `is_active=true`.
   `/stop` → deactivates.

## Links

- ADRs: —
- Releases: — (at PR time)
- PR: —
