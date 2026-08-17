# Analytics verification and the ledger parity gate

Two jobs live here: the **daily check** that the post-cutover analytics are
telling the truth, and the **parity gate** that decides when `product_events`
may finally be deleted. Background and the decisions behind both:
[`md/journal/migrations/analytics-one-identity.md`](../journal/migrations/analytics-one-identity.md).

## Run it

Paste this to an agent with the PostHog MCP available:

> Read `md/runbook/analytics-ledger-parity.md` and run the daily check. Report
> each check as pass or fail with the number you saw, then the parity-gate row
> for today. Do not change code or PostHog objects without asking — except the
> one step the runbook marks as safe to apply.

Everything below is against PostHog project **239290** (`real-metahunt`).
Timezone is UTC; the digest schedule is hourly 09:30–21:30 Europe/Kyiv.

## Daily check

### 1. Digest coverage — the whole point of the cutover

Every completed digest delivery must reach PostHog. Before the cutover only
subscriptions with a linked `users.id` did, which was 21%.

```sql
SELECT toStartOfHour(timestamp) AS hour, count() AS digests, uniq(person_id) AS people
FROM events WHERE event = 'digest_sent' AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY hour ORDER BY hour
```

**Pass:** a send hour reaches the count of currently active subscriptions
(~30, ask Postgres for the exact number if it matters). One event per person
per send — `digests` and `people` should be equal inside an hour.
**Fail:** an hour with 1–3 digests. That is the old `users.id` rule surviving
somewhere — grep for a capture still keyed on a user id rather than
`subscriptions.person_id`.

### 2. Unique clickers must count people, not ids

```sql
SELECT if(properties.is_anonymous = true, 'anonymous', 'named') AS kind,
       count() AS clicks, uniq(person_id) AS ids
FROM events WHERE event = 'vacancy_outbound_clicked' AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY kind
```

**Pass:** every `anonymous` click carries the flag, and insight `rbXvDt0P`
("Unique users — vacancy outbound") counts only the `named` ones.
**Fail:** anonymous clicks without the flag → a capture path is missing
`is_anonymous: true`. A count of "people" close to the count of clicks in the
`named` row → synthetic identities are leaking into a person metric again.

### 3. Are the anonymous clicks human?

Open question since 2026-08-17: 24 outbound clicks arrived in one hour, all
`surface=web_feed` with neither a subscription nor a journey, on a site with a
couple of pageviews a day.

```sql
SELECT toStartOfMinute(timestamp) AS minute, count() AS clicks
FROM events WHERE event = 'vacancy_outbound_clicked' AND properties.is_anonymous = true
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY minute ORDER BY minute
```

**Humans:** spread across the hour, roughly following digest sends and pageviews.
**A crawler:** a dense burst in one or two minutes, with no matching pageviews.
`/go/:id` treats a missing `Sec-Fetch-Mode` as human by design, which is the
hole a browser-UA crawler walks through. If it is a crawler, tighten
`redirect.controller.ts` — do not "fix" it by dropping the events.

### 4. The dispatcher is silent

The outbox dispatcher logs only on failure, so silence is the pass. Railway
project `d1bea564-d901-4b79-be43-119e6826590d`, environment `production`,
service `@metahunt/etl`, deploy logs, search `dispatch failed`.

**Fail:** anything at all. Pending rows retry forever, so the symptom is a
growing `analytics_outbox` backlog rather than lost data.

### 5. The staff filter, once the cohort has a member

Cohort 199394 (*Internal / Test users*) reads `is_staff`, which the ETL sets
from `users.roles` on every session mint. It had no members until 2026-08-17.

**Safe to apply without asking:** when the cohort count is ≥ 1, turn
`filterTestAccounts` back on for insights `xfJ8Ptim`, `rbXvDt0P`, `SPdfIvZf`
and say so in the report. It was switched off only because a filter matching
nobody implies a cleanliness that is not there.

Person properties attach to an event when it is ingested, so events older than
the first `is_staff` write may not be excluded. Compare the tile before and
after flipping the toggle and record the difference rather than assuming it.

## Parity gate — when the ledger may be deleted

`product_events` and `analytics_outbox` stay until PostHog independently
reproduces the ledger's counts for **seven consecutive days within 5%**. The
date in the old cutover document is not the condition; the condition is the
condition. A failed day resets the window.

Compare the same half-open Kyiv interval `[from, to)` in both systems:

| Behaviour | Postgres ledger | PostHog |
|---|---|---|
| Digest delivered | `digest_sent` | `digest_sent` |
| Digest outbound click | `digest_link_clicked` | `vacancy_outbound_clicked`, `surface=telegram_digest` |
| Feed outbound click | `apply_clicked` | `vacancy_outbound_clicked`, `surface=web_feed` |
| Activation | `telegram_linked` | `telegram_linked` |

The ledger keeps two names for a click; PostHog keeps one, split by `surface`.
That asymmetry is deliberate and ends with the ledger.

Record each day's row in the tracker. Investigate any gap above 5% or an
unexplained identity split before counting the day. When seven days pass, the
deletion work is phase 4 of the tracker — it drops the two tables and the
funnel, channels, retention and growth panels, and keeps the roster.

## Rollback

Nothing here is destructive. If PostHog delivery or identity stitching
regresses, the ledger is still authoritative: fix the producer, then restart
the window.
