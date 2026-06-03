# TG Notifications — research & TODO

Status: **research / not started**. Feature: user saves a track (or track + filters),
on new matching vacancies we push them to Telegram.

Confirmed decisions:
- **Onboarding:** web-driven + deep-link (`t.me/<bot>?start=<token>`). User builds the
  filter in the existing Variant C facet UI, hits "Subscribe", links Telegram via token.
- **Delivery:** one **digest per run** per user (not per-vacancy ping).

---

## Core idea

A **subscription = a saved `ListVacanciesParams`.** The web facet UI already produces
exactly the params `VacanciesService.list()` consumes (`trackSlug`, `roleIds`, `skillIds`,
`seniority`, `workFormat`, …).

> **Matching = run `list()` with the subscription's params + "new & unsent" constraint.**

No new matching logic — reuse `buildWhere`. Gives "what I saw in the catalog == what I get
notified about" for free (same count==click philosophy already in the tracks code).

---

## Grounded facts (from current code)

- ETL = Temporal, scheduled (`rssIngestAllWorkflow`, hourly 6–22 Kyiv, `rss-scheduler.service.ts`).
- Flow: `rssIngestWorkflow` → `parseAndDedup` (returns only NEW `rss_records` ids) → LLM
  extract → `startChild("vacancyPipelineWorkflow")` → `loadVacancy` UPSERTs into `vacancies`.
- `vacancies.loadedAt` is **immutable on upsert** → first-seen marker. `updatedAt` bumps on change.
- Tracks = `tracks` + `track_nodes` (`node.type` encodes ROLE/SKILL axis), resolved via
  `resolveTrackFilter` (override-else-inherit, one parent hop).
- `users(id, email, source)` exists (waitlist only). **No** subscription/notification/telegram
  entities. **No** outbound channel deps (no telegraf/grammy/nodemailer). Build from scratch.

---

## Architecture: split inbound vs outbound

Two different components — don't merge them.

| | Outbound (digest delivery) | Inbound (/start, /help, /stop, chat_id capture) |
|---|---|---|
| Nature | Stateless, on-demand | Persistent listener, event-loop |
| Caller | Temporal activity `sendDigest` | Telegram (push or pull) |
| Scaling | Horizontal, free | **Singleton** (see below) |
| Retries | Temporal | Telegram re-delivers updates |

- **Outbound** → Temporal activity in `apps/etl`. Scales fine.
- **Inbound** → singleton listener.
  - **long-polling (`getUpdates`)**: no public HTTPS needed (nice on Railway), but
    **single-consumer** — must run in exactly **1 replica**.
  - **webhook**: scales horizontally, but needs public TLS endpoint + registration.

### Decision (current stage, KISS)

- One `telegram` module **inside `apps/etl`**, inbound via **long-polling**.
- Outbound = activity in the same app. One deploy, shared DB/config.
- Caveat: while the poller lives in the worker process, the worker stays **1 replica**.
- **Extract to `apps/bot` (1 replica) or switch to webhook when:** need to scale the
  Temporal worker horizontally, OR want bot crash isolated from ingest, OR need >1 bot replica.
- Write the **sender stateless** now so it moves easily; only the inbound poller carries the
  singleton constraint.
- [ ] **CHECK:** does `apps/etl` already expose an HTTP server? If yes, webhook can be hosted
  there with no new service. If pure worker → polling avoids needing a public endpoint.

### Bot logic location

- Lib: **grammy** (typed, middleware, parses `/start <token>` payload out of the box).
- `apps/etl/src/telegram/`:
  - `telegram.service.ts` — bot client wrapper; `sendDigest(chatId, text)` (called by the
    activity) + start poller on bootstrap (`OnModuleInit`).
  - `handlers/` — `/start` (with token → link `chat_id` to pending subscription, activate;
    without token → greeting + web link), `/help`, `/stop` (`is_active=false`), `/list`.
  - Config: `TELEGRAM_BOT_TOKEN` via Railway variables.
- Handlers are thin: read/write `subscriptions` only. All matching stays in `VacanciesService`.
  Bot = transport, not business logic.

---

## Rate limits

Telegram Bot API:
- ~**30 msg/s** total across different chats (broadcast cap).
- ~**1 msg/s** to the same chat.
- Groups ~20/min (mostly N/A — we DM private chats).

Digest model: 1 msg per active subscriber-with-new-matches per run. At 30/s = **~1800
subscribers/min**; even 10k subs = ~6 min, with a full hour window. Cap won't bite for a long time.

If insufficient:
1. Telegram returns **HTTP 429** with `parameters.retry_after`.
2. Ignoring 429 → escalating temp blocks. Never hammer through 429.

Mitigations (in order):
1. Global throttle ~**25/s** (token-bucket under the 30 cap) in the send path.
2. Respect `retry_after` — model each send as a Temporal activity; on 429 throw retriable
   error with `nextRetryDelay = retry_after`. Temporal handles backoff/retry.
3. Spread sends across the hour (digest job isn't time-critical).
4. Hard ceiling (far future, YAGNI): one bot ≈ 30/s. To exceed sustained → shard across
   multiple bot tokens, or self-hosted local Bot API server. Don't build now.

---

## Data model (minimal, 2 tables)

- `subscriptions(id, chat_id text, params jsonb, is_active bool, created_at)` — `params` =
  saved `ListVacanciesParams`. jsonb → no migration when filters evolve.
- `sent_notifications(subscription_id, vacancy_id, sent_at)`, PK `(subscription_id, vacancy_id)`
  — source of truth for "already sent"; PK makes double-send impossible even on retry.

`buildWhere` extension:
- `loadedAfter?: Date` → `WHERE vacancies.loaded_at > $since` (candidate window).
- `excludeIds?: string[]` → anti-join already-sent.

---

## ETL hook

Separate **scheduled** workflow `notifySubscribersWorkflow` ~10–15 min after ingest (e.g. :15).
NOT inline in `vacancyPipelineWorkflow` (children are ABANDON/detached; per-vacancy = N pings;
batch = one digest + cheaper).

```
loadActiveSubscriptions()
for each sub:
  matchNewVacancies(sub, since)   // list() reuse, minus sent
  if matches: sendDigest(chatId, matches) ; recordSent(sub.id, ids)
```

`since` = previous successful run start − safety margin. Register Schedule like
`RssSchedulerService.ensureSchedule()`; add workflow to `apps/etl/src/workflows/index.ts`;
add activities to `activityClasses` in `temporal.module.ts`.

---

## Topology (now)

```
Temporal Schedule (:15)
   └─ notifySubscribersWorkflow
        ├─ matchNewVacancies (activity, reuse VacanciesService.list)
        └─ sendDigest (activity) ──> TelegramService ──> Bot API
                                       (stateless, throttle 25/s, 429→Temporal retry)
apps/etl process (1 replica for now)
   └─ telegram module
        └─ grammy poller (singleton) ──> /start<token>, /help, /stop ──> subscriptions
```

---

## Caveats / gotchas

- **Verification lag:** `list()` requires `role_node.status = VERIFIED`. A fresh vacancy whose
  ROLE node isn't verified yet won't match, and `loadedAt` won't move later → the
  `loadedAfter` window may miss it. Mitigation: wider window (`since − few hours`) + rely on
  `sent_notifications` for dedup. Document; acceptable for MVP.
- **Grouping tracks** (no criteria, e.g. "By Language") match nothing (`buildWhere` → `false`).
  Subscription to one = 0 notifications, or forbid subscribing to them.
- **Idempotency:** always write `sent_notifications` in the same activity that sends; PK guards
  double-send.
- Telegram rate limit / 429 handling (above).
- **Unsubscribe / `/stop`:** minimal `is_active=false`.

---

## MVP cut (smallest first)

- [ ] 2 tables + `buildWhere` `loadedAfter`/`excludeIds`.
- [ ] `matchNewVacancies` activity (reuse `list()`).
- [ ] outbound `sendDigest` (stateless) + manually seed one `subscriptions` row with my chat_id.
- [ ] `notifySubscribersWorkflow` + Schedule at :15. → live notifications, zero UI work.
- [ ] only then: onboarding — web "Subscribe" + deep-link token capture (grammy `/start`).

## Open questions

- [ ] `apps/etl` HTTP server present? (decides webhook vs polling long-term)
- [ ] Pending-subscription token lifecycle (TTL, where stored — on `subscriptions` row or temp).
- [ ] Digest message format (HTML, how many vacancies max per message, truncation).
- [ ] Do we link `subscriptions.chat_id` to the existing `users` table, or keep channel-only?
