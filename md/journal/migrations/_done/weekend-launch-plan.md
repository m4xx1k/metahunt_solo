# Weekend launch plan — TG notifications + PostHog

Status: **plan**. Target: ship to real users **this weekend**, then make a social post and
track acquisition/retention.

Reads with: `tg-notifications-todo.md` (TG mechanics — don't restate here),
`analytics-posthog-plan.md` (analytics architecture — don't restate here).

---

## What actually ships this weekend (scope)

The launch goal is **a trackable hook**: a social post that drives people to subscribe to
TG vacancy notifications, with the full funnel measured. So the deliverable is:

1. Homepage entry point to **subscribe to TG notifications** (reuses the existing Variant C
   facet UI to build the filter).
2. **PostHog live on web** (so the post is trackable from minute one).
3. **TG notifications working end-to-end**: subscribe → link via `/start` → scheduled digest.
4. **Retention loop closed**: `/r` redirect tracker on digest links.

That's it. Everything else (real auth, web sub-management, scaling, replay) is deferred.

---

## Two foundations to get RIGHT before writing feature code

These are cheap now and expensive to retrofit. Lock them before anything else.

1. **Canonical identity = `subscriber_uuid`.** Minted at Subscribe, PK of `subscriptions`,
   threaded through the deep-link token, used as `distinct_id` on both web and server.
   Never `chat_id`. (Full rationale: `analytics-posthog-plan.md#the-one-hard-problem`.)
2. **PostHog `/ingest` reverse-proxy + region choice.** Set `api_host`, EU/US region, and
   event names *first*. Changing any of these after launch fragments person history.

---

## Sequenced build (realistic 2-day cut)

### Day 1 — foundations + web (independently shippable)
Ship this even if TG slips — it already makes the launch trackable.

- [ ] `posthog-js`: `/ingest` rewrite in `next.config.ts`, client provider in `app/layout.tsx`,
      manual `$pageview` inside `<Suspense>` (app-router gotcha). → deploy.
- [ ] Freeze event taxonomy + UTM convention (`analytics-posthog-plan.md`).
- [ ] Homepage **Subscribe** entry: facet UI → `subscribe_clicked` event → POST creates
      `subscriptions` row (`subscriber_uuid`, `params`, `is_active=false`) + mints token →
      shows `t.me/<bot>?start=<token>` deep link.

### Day 2 — TG end-to-end
- [ ] DB: `subscriptions` + `sent_notifications` tables; `buildWhere` `loadedAfter`/`excludeIds`.
- [ ] grammy bot in `apps/etl` (polling, singleton): `/start <token>` (link `chat_id`,
      activate, `telegram_linked`), `/stop` (`unsubscribed`), `/help`. Token in Railway.
- [ ] `matchNewVacancies` + `sendDigest` activities (`posthog-node` + **flush**),
      `notifySubscribersWorkflow` + Schedule @:15.
- [ ] `/r` redirect tracker (Next route handler or etl endpoint): `digest_link_clicked` → 302.

> `apps/etl` is NestJS **with an HTTP server** — webhook is possible there, but polling is
> the KISS default for the weekend (no public-URL registration). Revisit if the worker needs
> to scale horizontally.

---

## Pre-launch gate — verify before pointing real users at it

Tick every box on a real run before the social post. These are correctness/trust items, not
nice-to-haves.

- [ ] **No spam / no misses:** `sent_notifications` PK `(subscription_id, vacancy_id)` enforced;
      `since`-window = prev successful run − safety margin. Run twice, confirm second run sends
      nothing new.
- [ ] **`/stop` works.** A user must be able to unsubscribe. Confirm `is_active=false` halts digests.
- [ ] **Single replica** for `apps/etl` (polling poller is single-consumer). Confirm Railway
      scale = 1 before launch.
- [ ] **Grouping-track guard:** criteria-less nodes (e.g. "By Language") match nothing →
      forbid subscribing to them in the UI, or the user gets silent 0 notifications forever.
- [ ] **HTML-escape digest text.** Telegram `parse_mode: HTML` breaks on unescaped `<`/`&` in
      vacancy titles → escape before send. Cap N vacancies/msg + truncation.
- [ ] **posthog-node flush** in every capturing activity (else `digest_sent` events vanish).
- [ ] **Token lifecycle:** TTL on pending tokens; `/start` consumes once; expired → friendly msg.
- [ ] **Dry-run:** seed your own `chat_id`, trigger the workflow, confirm you receive a digest,
      click a link, see `digest_link_clicked` land on your person in PostHog.
- [ ] **Launch link ready:** `?utm_source=…&utm_campaign=launch_2026_06` (and/or `?start=src_…`
      for TG-direct).

---

## Risk register (known caveats, accept-or-mitigate)

| Risk | Impact | Decision for weekend |
|---|---|---|
| **Verification lag** — `list()` needs `role_node VERIFIED`; fresh vacancy may not match in time, `loadedAt` won't move later → missed by `loadedAfter` window | Some new vacancies never notified | Widen window (`since − few hrs`); rely on `sent_notifications` for dedup. **Accept for MVP, document.** |
| **Rate limit / 429** | Temp bot block if hammered | Won't bite at launch scale (<<1800 subs/min). Just **don't crash on 429** (let Temporal retry); token-bucket throttle = deferred. |
| **posthog-node not flushing in activity** | Silent data loss | **Mitigate now** — flush is in the gate. |
| **Singleton poller in multi-replica** | Duplicate updates / lost updates | **Mitigate now** — pin etl to 1 replica. |
| **Identity keyed on chat_id** | Painful auth migration later | **Mitigate now** — `subscriber_uuid` spine. |

---

## Explicitly deferred (NOT this weekend)

- Real auth + web UI to view/manage subscriptions (the "normal authorization" idea). Spine is
  ready for it (`subscriber_uuid` → `alias` to Clerk id when it lands).
- Horizontal scaling, `apps/bot` extraction, webhook migration, bot-token sharding.
- Rate-limit token bucket, digest formatting polish, session replay / flags / A-B.
- Linking `subscriptions` ↔ `users` table (decide when auth lands; keep `subscriber_uuid` canonical).

---

## Open questions to close while building

- [ ] Token storage + TTL: on the `subscriptions` row (pending) or a temp table?
- [ ] Digest format: HTML, max vacancies/msg, truncation rule.
- [ ] `/r` redirect host: Next route handler (same domain as catalog, nicer) vs etl endpoint
      (already has posthog-node) — pick one.
- [ ] EU vs US PostHog region (GDPR → likely EU). **Permanent, decide before init.**
