# Migration — analytics cutover to `real-metahunt`

**Status:** in progress (blocked at step 2)
**Started:** 2026-08-02 · **Owner:** repo owner
**Goal:** one PostHog project, one identity, five events, two numbers. Then stop.

---

## Why this exists

Analytics accumulated two parallel pipelines plus a Postgres event ledger plus a
hand-rolled admin funnel. The result: metrics that were wrong in both directions
(inflated person counts, then silently zero) and no way to tell which. This
tracker exists so the cutover finishes instead of being re-diagnosed from scratch
in a new session.

---

## Verified current state (2026-08-04)

Everything below was checked against production, not inferred.

### PostHog projects

| id | name | receives events |
|---|---|---|
| 194189 | Default project | historic only |
| 194218 | metahunt | **frozen** — last server event `2026-08-02 18:30`, last `$pageview` still arriving |
| 239290 | **real-metahunt** | **target** — zero events ever received |

### The two pipelines in `apps/etl`

| | legacy `PostHogSink` | v2 `ProductAnalyticsService` |
|---|---|---|
| File | `platform/analytics/posthog.sink.ts` | `platform/analytics/product-analytics.service.ts` |
| Env key | `POSTHOG_ARCHIVE_API_KEY` | `POSTHOG_API_KEY` |
| Prod value | **absent** → client undefined → silently dormant | points at `real-metahunt` |
| `distinct_id` | `randomUUID()` per event (`analytics.service.ts:200,210`) | `users.id`, uuid-guarded |
| Also writes | Postgres ledger (`product_events`, `analytics_outbox`, `analytics_journeys`) | nothing but PostHog |

### Root cause of "nothing works"

1. The archive key was removed from Railway → the legacy sink went dormant →
   every event that still routed through it stopped being recorded anywhere.
   This is why data ends at `2026-08-02 18:30`.
2. `ProductAnalyticsService` is wired for only **two** of its seven methods:
   `subscriptionCreated` and `subscriptionDeactivated` (call sites in
   `04-notify/telegram/subscriptions.service.ts`). The other five —
   `vacancyOutboundClicked`, `digestSent`, `accountCreated`, `signedIn` — are
   defined but **never called**. The redirect controller still reaches the legacy
   path.
3. Those two wired events are rare (8 `subscription_created` in the last full
   week). No subscription happened after the cutover, so `real-metahunt` is
   legitimately empty. There is no additional hidden bug.

### Ruled out

- **Ad blockers.** The reverse proxy at `/ingest` is in place; server events don't
  pass through a browser at all.
- **Bot filtering eating Telegram traffic.** The in-app Telegram browser passes the
  UA filter — a real owner click was recorded at `2026-07-2X 17:17:50`. `curl` is
  correctly rejected. The filter is working as designed; leave it alone.
- **`isUuid()` rejecting user ids.** `users.id` is UUID v4, which the guard accepts.
- **A broken web `identify()`.** `apps/web/lib/analytics/use-analytics.ts:82`
  already calls `posthog.identify(userId)` with `users.id`. There is no
  `guestId` anywhere in the web app. The browser side is correct as written.

### Damage in the frozen project (for the record)

Measured in 194218 over the 7 days before freeze — do not treat this data as
person-level truth:

- `vacancy_outbound_clicked`: 46 events across 45 distinct ids; 43 matched
  nothing else in the project. Each click was a new "person".
- `match_scored`: 226 events / 226 persons — a pipeline event manufacturing people.
- `digest_evaluated`: 2351 events — cron noise dominating all volume.
- `$identify`: 14 in a week. Web and server identities never merged.

---

## The model — when to write code, when to click in PostHog

The rule that prevents this from recurring:

> **Could an outsider watching only URLs and clicks tell what happened?**
> Yes → no code. No, it's a fact in your database → code.

| Need | Where | Deploy? |
|---|---|---|
| New page tracked | `$pageview` + Path filter | no |
| Click on a link/button | Autocapture → Action in UI | no |
| New funnel | Insight in UI | no |
| Channel attribution | Breakdown by `$referring_domain` / `utm_*` | no |
| New business fact (created / linked / paid / churned) | `capture()` with `users.id` | yes |
| Event with no browser (Telegram, cron, webhook) | `capture()` with `users.id` | yes |

Corollaries:

- **New event = new verb. New context = new property.** `landing_view` is a page,
  not a verb — it duplicates `$pageview` and gets deleted. `apply_clicked` is a
  verb — it stays, with a `source` property instead of per-source variants.
- **Never hard-code a funnel.** `PRODUCT_FUNNEL_STEPS` in
  `admin/product-analytics/product-analytics.contract.ts` is the anti-pattern this
  migration removes: it makes every experiment a pull request.
- **Autocapture is currently OFF** (no `$autocapture` in the project's event list).
  Turn it on in the new project — it removes the need for most future click events.

---

## Decision: keep `/go` in the ETL, do not move it to a Next route handler

Considered and rejected.

**For:** a Next route handler could read the browser's `ph_*` cookie and stitch an
outbound click to an existing web identity.

**Against, and decisive:**

1. The redirect resolves a subscription and a vacancy from Postgres. The ETL owns
   those tables. Moving the endpoint means duplicating domain access in the web app.
2. Most outbound clicks originate in Telegram, where no PostHog cookie exists.
   The one upside doesn't apply to the majority case.
3. It relocates the endpoint without touching the actual defect, which is the
   `distinct_id` argument — a one-line change wherever the endpoint lives.

Revisit only if client-side attribution on outbound clicks ever becomes a real
requirement. It is not one now.

---

## Steps

Do these in order. Each has a verification that must pass before moving on.
If a verification fails, stop and fix it — do not continue.

### Step 0 — confirm the ETL is alive

Analytics has been silent since `2026-08-02 18:30`. Establish whether the service
is running before changing code.

```bash
railway logs --service "@metahunt/etl" --environment production --lines 100
```

**Verify:** the digest cron is logging on its normal cadence and there are no
PostHog client errors. If the service failed to redeploy after the variable
change, redeploy it now.

---

### Step 1 — point the web app at `real-metahunt`

The browser SDK still writes to the frozen project. Its key is baked in at build
time, so a variable change alone is not enough.

1. Set `NEXT_PUBLIC_POSTHOG_KEY` on the web service to the `real-metahunt`
   project key (the value in the local `.env.posthog-real-metahunt` file — never
   commit it; this repo is public).
2. Redeploy the web service. A restart is not sufficient — it must rebuild.

**Verify:** open the site, then in PostHog project `real-metahunt` → **Activity**,
confirm a `$pageview` appears within ~30 seconds.

---

### Step 2 — route the remaining five events through `ProductAnalyticsService`

This is the actual fix. Every call site below currently either goes through the
dormant legacy sink or does not exist.

| Event | Call from | Pass as `userId` |
|---|---|---|
| `vacancy_outbound_clicked` | `03-discovery/feed/redirect.controller.ts` | resolved `users.id` for the subscription |
| `digest_sent` | the digest send path in `04-notify` | subscription's `users.id` |
| `account_created` | auth signup handler | new `users.id` |
| `signed_in` | auth login handler | `users.id` |

Rules while doing this:

- Replace `analytics.service.ts:200` (`randomUUID()`) with the
  `ProductAnalyticsService` call. Do not add a new random id anywhere.
- If a subscription has no linked user yet, **skip the capture** rather than
  inventing an id. An unlinked subscription is not yet a person.
- Drop `match_scored` and `digest_evaluated` entirely. They are pipeline
  telemetry, not user behaviour, and they were the largest source of phantom
  persons. If they are ever needed again, they belong in logs, not PostHog.

**Verify — this is the moment the whole migration is judged on:**

1. Click your own Telegram digest link twice.
2. PostHog → **Activity** → two `vacancy_outbound_clicked` events appear.
3. Both carry the **same** `distinct_id`, equal to your `users.id`.
4. PostHog → **Persons** → search yourself → **one** person, both events on it.

One person, two events. That is the definition of done.

---

### Step 3 — delete what PostHog already does

Only after step 2 verifies.

- `landing_view` and its browser contract entry — duplicates `$pageview`.
- `PRODUCT_FUNNEL_STEPS` and the admin funnel it feeds.
- The admin contacts/analytics page and its SQL DAU formula. DAU is defined in
  PostHog now; two definitions guarantee two answers.
- Freeze branch `feat/contacts-dark-detail` — it builds a UI for looking at
  analytics, which PostHog already is.

**Verify:** `pnpm build` and the test suite pass; the admin no longer exposes an
analytics page.

---

### Step 4 — build the two insights, then stop

In PostHog, in `real-metahunt`:

1. **Settings → Project → enable Autocapture.**
2. **Funnel** (Product analytics → New insight → Funnel):

   | # | Step | Meaning |
   |---|---|---|
   | 1 | `$pageview` | arrived |
   | 2 | `landing_cta_clicked` | interested |
   | 3 | `subscription_created` | subscribed |
   | 4 | `telegram_linked` | **activated** |
   | 5 | `vacancy_outbound_clicked` | **received value** |

   Set **conversion window to 14 days** — the default 1 day cuts off everyone who
   subscribes in the evening and clicks a digest link the next morning, which
   reports a false 0% conversion. Breakdown by `$referring_domain`.

3. **Trend:** unique persons doing `vacancy_outbound_clicked`, weekly.
4. Pin both to one dashboard. Nothing else.

**Then stop.** Not when the dashboard is pretty. When one person shows two events.

---

### Step 5 — retire the Postgres ledger (not before ~2026-08-18)

The ledger is the only record of anything before the cutover, and it blocks
nothing once writes stop. Leave it read-only for two weeks, then remove in one
dedicated PR:

- delete `analytics-outbox.dispatcher.ts`, `analytics-outbox.store.ts`,
  `posthog.sink.ts`, `product-event.store.ts`, `product-event.factory.ts`
- drop `product_events`, `analytics_outbox`, `analytics_journeys` in a migration
- **keep** `subscriptions`, `deliveries`, `users` — product state, not analytics

Do not delete PostHog project 194218. Freeze it as a read-only archive of July.

---

## Running experiments after this (no deploys)

For a landing experiment such as `/radar` plus a post:

```
Funnel:
  Step 1: $pageview          filter Path = /radar
  Step 2: $pageview          filter Path = /
  Step 3: subscription_created
```

Duplicate the insight and change the path for the next experiment. No code.

Attribution without UTM parameters, when a link can't be tagged:

- `$referring_domain` — captured automatically on every pageview.
- `$initial_referring_domain` — stored on the person permanently, so "did people
  who first arrived from X still click vacancies in week 3" stays answerable.
- A dedicated landing path per channel is itself attribution.

---

## Where to look in PostHog

Three places. Ignore the rest of the product at this stage.

| Screen | Use |
|---|---|
| **Activity** | live event stream — "did my click land?" This is the debugging tool. |
| **Persons** | search yourself; confirms identity is not fragmented |
| **Dashboard** | the two pinned insights, reviewed weekly |

Deliberately ignored for now: Web Analytics, Session Replay, Experiments,
Surveys, Error Tracking, Data Warehouse.

Keep event meanings in two places, both one line each:
`apps/etl/src/platform/analytics/events.ts` (source of truth) and each event's
Description field under **Data management → Events** in PostHog.

---

## When to invest in analytics again

Not on a schedule — on a blocked decision. When a specific choice depends on a
number you don't have, build that number and nothing else. Rough thresholds:

- funnels are noise below ~30 conversions/week
- retention needs 4+ weeks of stable identity
- below ~100 weekly actives, a SQL query answers faster than a dashboard

---

## History that must not be re-litigated

Both of these cost a full session each. They are settled.

- **"PostHog isn't connected at all."** It was. The empty screen was project
  `real-metahunt`, which had never been wired to anything, while production was
  still writing to `metahunt` (194218). When a metric reads exactly zero, check
  that you are looking at the right project before concluding the pipeline is dead.
- **"Backfill the ledger into PostHog."** Rejected. The events are already in
  194218; only their identity is broken, and PostHog cannot re-stitch persons
  retroactively. Mark the cutover with an Annotation and read anything earlier as
  directional only.

---

## Step 2 — implementation notes (read before coding)

Traced on branch `fix/analytics-v2-call-sites` (worktree `/home/maxxik/solo/mh-analytics-v2`).

### The exact leak

`AnalyticsService.applyClicked(vacancyId, subscriptionId?, journeyId?)` branches three ways:

| branch | current behaviour | reaches v2 PostHog? |
|---|---|---|
| `subscriptionId` present (**Telegram digest tap**) | writes `digest_link_clicked` to the Postgres ledger, returns | **no** — ledger dispatcher feeds the dormant `PostHogSink` |
| `journeyId` present (web feed tap) | writes `apply_clicked` to the ledger, returns | **no** — same dead end |
| neither (anonymous web tap) | direct `posthog.capture(randomUUID(), …)` with `$process_person_profile: false` | reaches the sink, personless |

The first branch is the one that matters: it is the Telegram traffic, and it is
the branch that returns before any v2 capture can happen.

### Blocker found

`AnalyticsService` has **no way to resolve `users.id` from a `subscriptionId`** —
no store is injected and no such lookup exists anywhere in
`platform/analytics` or `04-notify/telegram`. This lookup must be added before
`ProductAnalyticsService.vacancyOutboundClicked(userId, surface)` can be called.
This is why step 2 is larger than "wire four call sites".

### Recommended shape

Additive only — do not remove ledger writes in this PR, the admin dashboard reads
from `product_events` and must keep working.

1. Add a narrow lookup returning `users.id` (nullable) for a subscription id.
   Keep it in the analytics module; it needs one column from `subscriptions`.
2. Inject `ProductAnalyticsService` into `AnalyticsService`.
3. In the `subscriptionId` branch, after the existing ledger enqueue, resolve the
   user and — only when one exists — call
   `vacancyOutboundClicked(userId, "telegram_digest")`. An unlinked subscription
   emits nothing; never substitute a random id.
4. Same treatment for the `journeyId` branch with `surface: "web_feed"`, if the
   journey resolves to exactly one subscription. Otherwise skip it.
5. Leave `matchScored` alone in this PR — it already sets
   `$process_person_profile: false`, so it does not create person profiles.
   (Earlier sessions claimed it manufactured 226 persons; it inflates
   `uniq(person_id)` in raw SQL but does not create Person records. Drop it in the
   taxonomy PR instead, on the grounds that it is cron telemetry, not behaviour.)

### Remaining call sites after the above

`digest_sent`, `account_created`, `signed_in` — all have `ProductAnalyticsService`
methods already written and simply are not called. These are straightforward once
the pattern from the redirect path exists.

### Verification is unchanged

Two taps on your own digest link → two `vacancy_outbound_clicked` in Activity →
identical `distinct_id` equal to your `users.id` → one row in Persons.
