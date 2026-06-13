# tg-notifications — Telegram vacancy digests

**Branch:** `feat/tg-notifications`
**Status:** in-progress
**Started:** 2026-06-03 · **Closed:** —

## Status snapshot — 2026-06-03

**Shipped & working on `feat/tg-notifications` (8 commits, not merged):** subscribe → link →
manage → preview the digest is a complete loop. Auto-send on a schedule is the one remaining
piece before it's a real product.

- ✅ **Schema + migration** `0014` (`subscriptions`, `sent_notifications`) — applied to local DB.
- ✅ **Isolated grammy bot module** (`apps/etl/src/telegram/`), long-polling, dormant without a
  token, @username auto-derived via `getMe`. Commands: `/start` (link + dedup +
  already-active), `/list` (per-sub inline ❌ unsub), `/preview`, `/stop`, `/help`.
- ✅ **Web "Subscribe"** — `POST /subscriptions` stores the effective feed query; `SubscribeButton`
  in the feed sidebar returns a working `t.me/<bot>?start=<id>` deep link. **Verified live.**
- ✅ **Digest renderer** — role-led card, trimmed italic subtitle, minimal CLI glyphs
  (`⌖`/`◆`/`→`), one meta line; `/preview` sends 3 cards + "N new in 14d" (reuses
  `FeedService.search`; `loadedAfter` added to feed). Verified on real data.
- ⏳ **Not built yet:** the scheduled engine — `matchNewVacancies`/`sendDigestPage`,
  `notifySubscribersWorkflow` + Schedule @:15, `sent_notifications` writes, paging,
  `created_at` floor, `excludeIds` (T4 remainder, T6). **Nothing auto-sends — `/preview` only.**
  Step-by-step build playbook: [#t6-build-guide](#t6-build-guide).

**Update — later 2026-06-03 (`0f461b0`):** digest card reworked (seniority-led headline,
raw title dropped, EN flag, reservation/test perks with reservation accented, domain +
relative-time footer, salary bold, company removed, per-sub label in header); apply links
now route through `GET /go/:id` (`RedirectController` + `FeedService.getApplyLink`, new
`PUBLIC_BASE_URL` env) as the click-tracking seam; one-tap `SubscribeButton` (each tap mints
a fresh sub + opens Telegram); orphan-pending GC (`SubscriptionsService.purgeStalePending`,
scheduled from `TelegramService`). T6 (auto-send) + T4 remainder still open.

**Live DB state:** 1 active subscription — role *Full Stack Developer*, linked to a chat,
`is_active=true`, `sent_notifications` empty.

**Commits:** `cae4f27` schema+module · `f9d5f5e` web subscribe · `322bee5` getMe username ·
`a84f07a` digest+/preview · `a1e7573` /list unsub · `7cddbe1` dedup · `648c3c3` already-active ·
`bba423a` role-led minimal cards.

**Open decisions (not blocking):** subscription semantics *snapshot vs follow-track* (see below,
leaning snapshot); final digest glyph set (current `⌖`/`◆`/`→` is provisional).

**Next:** T6 (scheduled auto-send) + T4 remainder; then T7 pre-launch gate.

## Context

A subscription = a saved `list()` filter + a Telegram chat. On a schedule we match
new vacancies for each subscriber and push one digest. Matching reuses the catalog
`list()` — no new matching logic. Full research lives in journal drafts:
[`_done/tg-notifications-todo.md`](_done/tg-notifications-todo.md) (mechanics), [`_done/weekend-launch-plan.md`](_done/weekend-launch-plan.md) (sequencing + pre-MVP gate),
[`_done/analytics-posthog-plan.md`](_done/analytics-posthog-plan.md) (analytics, deferred).

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
- [~] T5 — digest rendering ✅: `digest.renderer.ts` — headline = clean taxonomy **role**
      (+ seniority), raw title as a trimmed italic subtitle to disambiguate, monochrome
      CLI-vibe glyphs (`⌖` header, `◆` card, `→` apply), one emoji-free meta line
      (company · format · place · $salary · EN level), escaped, skills capped, CEFR. Plus
      `/preview` bot command (reuses `FeedService.search`,
      3 cards + "N new in 14d" count, `DIGEST_WINDOW_DAYS`/`DIGEST_PREVIEW_SIZE` consts).
      Verified on real data. Still pending: `matchNewVacancies`/`sendDigestPage` activities +
      paging + `sent_notifications` writes for the scheduled (non-preview) path.
- [ ] T6 — `notifySubscribersWorkflow` + Schedule (register like `RssSchedulerService.ensureSchedule`) — *done when:* live digests fire. **Step-by-step:** [#t6-build-guide](#t6-build-guide).
- [ ] T7 — pre-launch gate (see [`_done/weekend-launch-plan.md`](_done/weekend-launch-plan.md)): 1 replica, `/stop`, dedup re-run, grouping-track guard, dry-run.

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
- **Dedup at link time, not create time.** The row is created before the chat is known
  (web-create → `chat_id` null), so we can't dedup on create. `linkChat` (`/start`)
  distinguishes: re-tapping an already-active link from the same chat → `already_active`
  (no-op, "вже активна"); a token already claimed by another chat → `not_found` (no
  takeover); else if the chat already has an active sub with identical `params` (jsonb `=`,
  key-order independent) → delete the just-tapped pending row, "already subscribed"; else
  activate. Orphan
  pending rows from re-clicks (never `/start`-ed) linger inert (null chat); a TTL cleanup is a
  future nicety. A concurrent double-`/start` of two same-param tokens can still race past the
  check (no unique index yet) — acceptable for MVP.
- **Analytics deferred.** Ship TG first. PostHog is purely additive later (no schema change) —
  `subscriptions.id` is already the future `distinct_id`. See [`_done/analytics-posthog-plan.md`](_done/analytics-posthog-plan.md).
- **Digest rendering (T5) — as shipped.** Render from `VacancyDto` (`FeedService.list()`).
  Card lines: `◆ <b>role</b> · Seniority` → trimmed italic raw-title subtitle (skipped when it
  equals the role) → skills line → one meta line (`company · format · place · $salary · EN level`)
  → `→ <a>source</a>`. Headline is the **canonical role**, not the noisy scraped title — that
  fix also removed the old seniority-in-title dup, so seniority is always shown on the headline.
  Rules: graceful degradation (render a field only when present); english CEFR
  (BEGINNER→A1, INTERMEDIATE→B1, UPPER_INTERMEDIATE→B2, ADVANCED→C1, NATIVE→C2); salary
  both→`$min–max`, min→`from $min`, max→`up to $max`, symbol $/€/₴; skills required, cap 5 +`+N`;
  locations cap 2 +`+N`. Monochrome CLI-vibe glyphs (`⌖`/`◆`/`→`), cards split by a blank line.
  HTML `parse_mode`, escaped, link preview disabled on send.
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

## T6 build guide

**Goal:** a Temporal schedule fires a few times a day, and for **each active
subscription** pushes one digest of vacancies that appeared *since the user
subscribed* and *haven't been sent before*. **If a subscription has zero new
matches, nothing is sent** — no empty digests.

It mirrors the RSS pipeline one-for-one, so copy that shape:

| RSS (reference) | Telegram T6 (build this) |
|---|---|
| `rss/workflows/rss-ingest-all.workflow.ts` | `telegram/workflows/notify-subscribers.workflow.ts` |
| `rss/activities/*.activity.ts` + `activities/index.ts` (`RSS_ACTIVITIES`) | `telegram/activities/notify.activity.ts` + `activities/index.ts` (`TELEGRAM_ACTIVITIES`) |
| `rss/rss-scheduler.service.ts` (`OnApplicationBootstrap`) | `telegram/notify-scheduler.service.ts` |

**Mental model:** workflows are *sandboxed orchestration* — no DB, no
`Date.now()`, no Nest DI. They only call activities via `proxyActivities`.
Activities are normal `@Injectable() @Activity()` Nest classes that do all IO
(DB, Telegram). Keep that split.

### 1 · Activity — `NotifyActivity` (`telegram/activities/notify.activity.ts`)

Decorate `@Injectable() @Activity()` like `RssListSourcesActivity`; inject
`SubscriptionsService`, `FeedService`, `TelegramService`, `ConfigService`,
`DRIZZLE`. `@ActivityMethod()` methods:

- `listActiveSubscriptions()` → `{ id, chatId, params, createdAt }[]`. Add a
  `SubscriptionsService.listAllActive()` (all active rows, not chat-scoped).
- `matchNewVacancies(sub)` → run `FeedService.search` with `loadedAfter` (already
  wired) **plus the T4 remainder** (see §4): the per-sub `created_at` floor and the
  `excludeIds` anti-join against `sent_notifications`. Return `{ items, total }`.
  Page size = `MAX_PER_MESSAGE` (~8). **If `total === 0`, the workflow skips it.**
- `sendDigestPage(chatId, subscriptionId, vacancyIds, html)` → `TelegramService.sendMessage`
  then insert one `sent_notifications` row per `vacancyId` (`onConflictDoNothing` — the
  composite PK is the double-send guard). Write **per page, after a successful send**, so
  a retried page never re-sends earlier pages.

Register in **both** `telegram/activities/index.ts` (`export const TELEGRAM_ACTIVITIES = [NotifyActivity] as const;`),
the `TelegramModule` providers, and `temporal.module.ts` `activityClasses`
(`...TELEGRAM_ACTIVITIES`) — exactly how `RSS_ACTIVITIES`/`LOADER_ACTIVITIES` are wired.

### 2 · Workflow — `notifySubscribersWorkflow` (`telegram/workflows/notify-subscribers.workflow.ts`)

```
const a = proxyActivities<typeof NotifyActivity.prototype>({
  startToCloseTimeout: "60s", retry: { maximumAttempts: 3 },
});
export async function notifySubscribersWorkflow() {
  const subs = await a.listActiveSubscriptions();
  for (const sub of subs) {                 // sequential: Telegram is rate-limited
    const { items, total } = await a.matchNewVacancies(sub);
    if (total === 0) continue;              // ← the "skip empty" rule
    for (const page of chunk(items, MAX_PER_MESSAGE)) {   // chunk() is a pure helper
      const html = renderDigest(page, { totalNew: total, windowDays, applyBaseUrl, label });
      await a.sendDigestPage(sub.chatId, sub.id, page.map(v => v.id), html);
    }
  }
}
```

Re-export from `telegram/workflows/index.ts`, then add
`export * from "../telegram/workflows";` to `apps/etl/src/workflows/index.ts`
(the worker's single `workflowsPath`). Rendering (`renderDigest`) is pure and
sandbox-safe; the `applyBaseUrl`/`label` it needs are computed inside the
activity (which has `ConfigService` + `SubscriptionsService.describe`) and passed
in, **not** read in the workflow.

### 3 · Scheduler — `NotifySchedulerService` (`telegram/notify-scheduler.service.ts`)

Copy `RssSchedulerService` verbatim, changing: `SCHEDULE_ID = "tg-digest-daily"`,
`workflowType: "notifySubscribersWorkflow"`, `workflowId: "tg-digest"`, and a
calendar spec for a few daytime firings (e.g. `hour: { start: 9, end: 21, step: 4 }`,
`minute: 0`, `Europe/Kyiv`). Keep `ScheduleOverlapPolicy.SKIP`. Register in
`TelegramModule` providers. It installs the schedule on bootstrap; idempotent
create-or-update.

### 4 · T4 remainder — extend `buildWhere` (`feed/feed.service.ts`)

`loadedAfter` exists. Add to `FeedSearchParams` + `buildWhere`:
- **`createdFloor?: Date`** → candidate floor is `loaded_at > GREATEST(sub.createdAt, now() - SCAN_WINDOW)`.
  Compute `GREATEST` in the activity (it has both dates) and pass the result as `loadedAfter`;
  no SQL change needed if you fold it there. This stops a brand-new subscriber getting the
  whole pre-subscription backlog.
- **`excludeIds?: string[]`** → `NOT IN (already-sent vacancy ids for this sub)`. Source the
  ids via an anti-join/sub-select on `sent_notifications` (`subscription_id = sub.id`).
  This — not a stored watermark — is what makes matching correct and idempotent.

### 5 · Single-replica caveat

`sendDigestPage` calls `TelegramService.sendMessage`, which needs an **initialized
bot** (token present). Today the poller initializes the bot in every replica with
a token and the service is pinned to 1 replica (T7), so the send activity and the
bot are co-located — fine. **Before scaling the worker past 1 replica**, decouple
sending (stateless `bot.api.sendMessage`) from polling, or the activity may land on
a replica whose bot is dormant.

### 6 · Verify

1. Seed: an active subscription + a vacancy with `loaded_at > created_at` matching its filter.
2. Trigger the workflow by hand (Temporal UI "start workflow", type `notifySubscribersWorkflow`,
   task queue from `TEMPORAL_TASK_QUEUE`) — don't wait for the schedule.
3. Assert: digest arrives, `sent_notifications` has the rows.
4. Re-run immediately → **nothing sends** (anti-join), proving idempotency.
5. A subscription with no new matches → no message.

## Links

- ADRs: —
- Releases: — (at PR time)
- PR: —
