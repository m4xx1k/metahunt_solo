# Analytics / PostHog — cross-platform tracking

Status: **shipped** (PR #34). Tracks **acquisition → activation → retention** across
**web + Telegram** as one funnel, one person. Code is the source of truth:
`apps/etl/src/platform/analytics/` (`analytics.service.ts`, `events.ts`) and
`apps/web/lib/posthog.tsx` + `apps/web/lib/hooks/use-analytics.ts`.

Companion docs: `tg-notifications-todo.md` (TG mechanics), `weekend-launch-plan.md`
(sequencing).

---

## The one hard problem: one person, two surfaces

PostHog keys retention/funnels **per person** (`distinct_id`). Cross-platform tracking
reduces to: web events and Telegram events must land on the same person.

### Identity model — `tg:<chat_id>` canonical, `subscription_uuid` the bridge

`subscription_uuid` is the cross-context join key; `tg:<chat_id>` is the canonical
**human** id. A chat owns many subscriptions (many uuids), so the human-level id is the
chat, not any single uuid.

```
anon browser ──alias──▶ subscription_uuid ──alias──▶ tg:<chat_id>  ◀── canonical human
 (cookie distinct_id)                                      │
                                       (later auth) ───────┴──alias──▶ user_id
```

Flow:

1. **Web (anon):** `posthog-js` gives every visitor a cookie `distinct_id`. With
   `person_profiles: "identified_only"`, anonymous browsing mints no person profile.
2. **On Subscribe:** backend mints `subscription_uuid` (the PK of the `subscriptions`
   row). Web calls `posthog.alias(subscription_uuid)` (`use-analytics.ts`) → the anon
   visitor collapses into the subscription person, carrying prior web activity + UTM.
3. Same uuid travels in the deep link `t.me/<bot>?start=<uuid>`.
4. **Bot `/start <uuid>`:** captures `chat_id`, and `telegramLinked` aliases the uuid
   onto `tg:<chat_id>`, then stamps `chat_id` as a **person property** (not a key).
5. **All later TG events** (`digest_sent`, `unsubscribed`) fire on `tg:<chat_id>`;
   `digest_link_clicked` fires on the referring `subscription_uuid`, which the alias has
   already folded into the same human.

**Alias direction is a real footgun.** `alias({ distinctId: 'tg:'+chatId, alias: uuid })`
— the canonical `tg:<chat_id>` must be the merge *target* (`distinctId`) and the fresh
uuid the merge *source* (`alias`). PostHog rejects `$create_alias` when the `alias` value
is already an identified `distinct_id`, so reversing it works only for a chat's **first**
subscription and silently drops every later one. The uuid is always new → it merges every
time.

When real auth lands, `identify(user_id)` is just one more alias on the same graph — the
stitching above does not change.

---

## Web setup (`apps/web`, Next 16 app router, React 19)

`apps/web/lib/posthog.tsx` (client provider, dormant without `NEXT_PUBLIC_POSTHOG_KEY`):

- **Reverse-proxy ingestion** — `api_host: "/ingest"`, a same-origin path proxied to
  PostHog EU by `next.config.ts` rewrites, so ad/tracker blockers don't drop events.
  `ui_host: "https://eu.posthog.com"` keeps toolbar / "view in PostHog" links working.
  Changing the region/host after launch fragments person history — set it once.
- `person_profiles: "identified_only"` — a profile exists only after
  `posthog.alias(subscription_uuid)`.
- App-router note: client-side navigation doesn't reload, so manual `$pageview` capture
  with `usePathname`/`useSearchParams` must sit inside `<Suspense>` (Next 16 requirement).

---

## Server setup (`apps/etl`, NestJS + Temporal)

`AnalyticsService` is the single seam that imports `posthog-node`; feature services call
domain methods only (`subscriptionCreated`, `telegramLinked`, `digestSent`,
`applyClicked`, `unsubscribed`). Event names live in `events.ts` (no scattered literals).

- **Dormant** when `POSTHOG_API_KEY` is unset — every method no-ops, so local/test/CI ship
  nothing (mirrors the `TELEGRAM_BOT_TOKEN` pattern).
- `flushAt: 1, flushInterval: 0` — the server is long-lived but low-traffic, so flush each
  event immediately rather than batching; `shutdown()` on `onModuleDestroy` drains the
  last captures. (Inside short-lived Temporal activities, immediate flush also avoids the
  "activity killed before the queue flushes" footgun.)
- All calls are **fire-and-forget** — an analytics hiccup must never break a subscription
  or a digest.

---

## Event taxonomy (freeze — renaming a value splits the metric)

`snake_case`, stable. Defined in `events.ts` (server) + `use-analytics.ts` (web).

| Event | Surface | distinct_id | Key props |
|---|---|---|---|
| `$pageview` | web | anon/uuid | `$current_url`, UTM |
| `subscribe_clicked` | web | anon→uuid | `params` |
| `subscription_created` | server | `subscription_uuid` | `params` |
| `telegram_linked` | server (bot) | `tg:<chat_id>` | `uuid`, `result` |
| `digest_sent` | server | `tg:<chat_id>` | `subscriptionId`, `vacancies`, `pages` |
| `digest_link_clicked` | server (`/go/:id`) | `subscription_uuid` | `vacancyId` |
| `unsubscribed` | server (bot) | `tg:<chat_id>` | `method`, `subscriptionId`/`count` |

---

## Acquisition attribution

PostHog auto-captures `utm_*` into person initial-properties, so the launch link is just
`https://<domain>/?utm_source=twitter&utm_medium=social&utm_campaign=launch_2026_06`.
Freeze one `utm_campaign` value per post so channels stay comparable. TG-direct
acquisition (post links straight to the bot) can encode the source in the deep-link
payload and read it on `/start`.

## Retention — the TG loop

Telegram messages run no JS, so a digest click is tracked server-side: digest links point
at `/go/:id`, which fires `digest_link_clicked` then 302s to the vacancy. Without it you
measure *delivery* (`digest_sent`), not *engagement* — and engagement is the retention
signal for a notification product.

Insights to build: **Funnel** `$pageview → subscribe_clicked → telegram_linked →
digest_sent → digest_link_clicked`; **Retention** on returning `digest_link_clicked`
week-over-week; **Channel breakdown** by `utm_source`.

## PII / hygiene

- `distinct_id` is `subscription_uuid` or `tg:<chat_id>` only — never email, never raw
  `chat_id` as a key (`chat_id` is a person property).
- Keep deep-link tokens / `/go/:id` params out of autocaptured `$current_url` on
  identifying pages.
- EU cloud (GDPR) — region is a permanent choice.

## Deferred (YAGNI)

Real auth / web subscription-management UI; `alias` to a Clerk id (only when auth lands);
session replay, heatmaps, feature flags, A/B (turn on later); self-hosted PostHog.
