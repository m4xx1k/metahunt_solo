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
      `TelegramService` (grammy poller lifecycle + `/start`/`/list`/`/preview`/`/stop`/`/help`,
      stateless `sendMessage`), `SubscriptionsService` (link/deactivate/describe). `/list`
      shows each active sub with an inline "❌ Відписатись" button (callback `unsub:<id>`,
      chat-scoped so a forged callback can't touch others' subs); `/stop` deactivates all.
      Skips poller without token.
- [x] T3 — web "Subscribe": facet UI → `POST /subscriptions` creates a row (effective feed
      query as `params`, inactive) → returns `t.me/<bot>?start=<id>`; web shows "Відкрити
      Telegram". Endpoint + `SubscriptionsService.create` in the telegram module;
      `SubscribeButton` (tier-3) in the feed sidebar, hidden when the query matches nothing
      (`trackSlug && !hasPreset`). Bot @username is derived from the token via `getMe` at
      startup — no extra env var. — *done when:* clicking Subscribe yields a working deep
      link. ✅ verified live (`https://t.me/<bot>?start=<id>`).
- [~] T4 — `buildWhere` extension: `loadedAfter` ✅ (feed `loaded_at > x`); `excludeIds` +
      `created_at` floor still pending for the scheduled path.
- [~] T5 — digest rendering ✅: `digest.renderer.ts` (Rich card, escaped, skills capped,
      CEFR, seniority dedup) + `/preview` bot command (reuses `FeedService.search`,
      3 cards + "N new in 14d" count, `DIGEST_WINDOW_DAYS`/`DIGEST_PREVIEW_SIZE` consts).
      Verified on real data. Still pending: `matchNewVacancies`/`sendDigestPage` activities +
      paging + `sent_notifications` writes for the scheduled (non-preview) path.
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
- **Digest rendering (T5).** Render from `VacancyDto` (`FeedService.list()`). Per-vacancy
  "rich card": title (link) → company → skills → location/format → salary/english → apply.
  Rules: (a) **graceful degradation** — render a field only when present, no empty rows;
  (b) **no seniority dup** — show the seniority chip only if the title doesn't already
  contain that level; (c) **english as CEFR** — BEGINNER→A1, INTERMEDIATE→B1,
  UPPER_INTERMEDIATE→B2, ADVANCED→C1, NATIVE→C2; (d) salary: both→`$min–max`, min-only→
  `from $min`, max-only→`up to $max`, currency symbol $/€/₴; (e) skills: required first,
  cap ~5 + `+N`. Card style preferred (pending final confirm). HTML `parse_mode`, escape.
- **Digest paging (T5/T6).** No truncation — page instead. Order newest-first; cap each
  message by `MAX_PER_MESSAGE` (~8) AND a ~3500-char budget (under Telegram's 4096); header
  shows `(i/n)`. Sequential sends, ~1 msg/s per chat, honor `retry_after` on 429. Write
  `sent_notifications` **per page after a successful send**, so a retried page never
  double-sends earlier pages. Workflow: matches → chunk → `sendDigestPage(chunk)` per chunk.
  Far-future hard ceiling (collapse tail to "N new — see site") is YAGNI now.

## Test `/start` locally (after this session)

1. `pnpm db:up` then **`pnpm db:migrate`** — applies `0014` (without it, `POST /subscriptions`
   500s: no `subscriptions` table).
2. Create a bot via @BotFather; in repo-root `.env` set `TELEGRAM_BOT_TOKEN=...`. The bot
   @username is auto-derived via `getMe` — no other var needed.
3. `pnpm --filter @metahunt/etl build && pnpm --filter @metahunt/etl start`
   (log shows `Telegram bot @<name> polling`).
4. **Bot only:** DM `/start` → greeting; `/help`; `/stop`.
5. **Full subscribe flow:** ensure web `.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:3000`
   (the etl port), `pnpm dev:web`, open the feed, set a filter, click **🔔 Сповіщення в
   Telegram** → tap "Відкрити Telegram" → `/start` auto-fires with the token → "Підписку
   активовано"; the row now has your `chat_id`, `is_active=true`. `/stop` → deactivates.
   (Manual alt: `INSERT INTO subscriptions (params) VALUES ('{}'::jsonb) RETURNING id;` then
   `/start <id>`.)

## Links

- ADRs: —
- Releases: — (at PR time)
- PR: —
