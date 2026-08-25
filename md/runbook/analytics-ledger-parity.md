# Analytics verification and the ledger parity gate

Two jobs live here: the **daily check** that the post-cutover analytics are
telling the truth, and the **parity gate** that decided when `product_events`
may be deleted — closed 2026-08-24, kept as the record phase 4 rests on. The
ledger itself was dropped on 2026-08-25, so only the daily check is still a
thing you run, and nothing below can be re-measured against Postgres. Background and the decisions behind
both:
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

Since 2026-08-24 the split is carried by the event name, not by a property a
reader has to remember: an attributable tap is `vacancy_outbound_clicked`, one
with neither `?s=` nor `?j=` is `vacancy_outbound_unattributed`. The
`is_anonymous: true` flag stays on the latter, so queries written against it —
and the rows ingested under the old shared name before that date — keep working.

```sql
SELECT event, count() AS clicks, uniq(person_id) AS ids
FROM events
WHERE event IN ('vacancy_outbound_clicked', 'vacancy_outbound_unattributed')
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY event
```

**Pass:** `vacancy_outbound_clicked` carries only attributable taps, and its
`ids` count sits well below its `clicks` count (people tap more than once).
Insight `rbXvDt0P` ("Unique users — vacancy outbound") reads that event.
**Fail:** `ids` close to `clicks` on the attributed row → synthetic identities
are leaking into a person metric again. Any `vacancy_outbound_clicked` row
carrying `is_anonymous = true` → a capture path skipped the rename.

### 3. Are the anonymous clicks human?

Still open. Measured 2026-08-24 across the 08-17→08-23 window, unattributed taps
per day: 18, 180, 42, 44, 55, 89, 68 — against 30, 14, 24, 8, 18, 4, 2
attributed ones. On 08-23 that is 97% of all `/go` volume, on a site with a
couple of pageviews a day.

One theory is already ruled out: these are **not** pre-cutover users PostHog
fails to recognise. `ApplyLink.tsx` mints a journey id on first render for any
browser, so a real feed tap always carries `?j=` and a digest tap always carries
`?s=`, whenever the account was created. A hit with neither is not a returning
human.

```sql
SELECT toStartOfMinute(timestamp) AS minute, count() AS clicks
FROM events WHERE event = 'vacancy_outbound_unattributed'
  AND timestamp > now() - INTERVAL 24 HOUR
GROUP BY minute ORDER BY minute
```

**Humans:** spread across the hour, roughly following digest sends and pageviews.
**A crawler:** a dense burst in one or two minutes, with no matching pageviews.
`/go/:id` treats a missing `Sec-Fetch-Mode` as human by design, which is the
hole a browser-UA crawler walks through. If it is a crawler, tighten
`redirect.controller.ts` — do not "fix" it by dropping the events.

### 4. Nothing is buffering

There is no outbox any more: `PostHogClient` captures directly from the domain
service that owns the act, so a dropped event shows up as a missing count in
check 1, not as a backlog. Railway project `d1bea564-d901-4b79-be43-119e6826590d`,
environment `production`, service `@metahunt/etl`, deploy logs, search
`analytics` — every early return in an analytics path logs at warn.

**Fail:** `outbound click has no person`, or any `analytics capture failed`.

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

## Parity gate — CLOSED 2026-08-24

**The gate passed and is no longer run.** It is kept here because phase 4 is the
work it authorised, and whoever does that work should see what it rested on.

The condition was seven consecutive days of PostHog reproducing the ledger's
counts within 5%. What the window produced was **six consecutive full days at
0.0% divergence** — not "inside the tolerance", identical event for event — plus
a seventh day excluded for cause. The owner accepted six on 2026-08-24 rather
than wait for a seventh that could only restate the same result.

| Kyiv day | digest_sent | digest click | feed click | activation |
|---|---|---|---|---|
| 2026-08-18 | 127 = 127 | 8 = 8 | 14 = 14 | 2 = 2 |
| 2026-08-19 | 101 = 101 | 3 = 3 | 24 = 24 | 0 = 0 |
| 2026-08-20 | 103 = 103 | 5 = 5 | 8 = 8 | 0 = 0 |
| 2026-08-21 | 103 = 103 | 2 = 2 | 18 = 18 | 0 = 0 |
| 2026-08-22 | 29 = 29 | 1 = 1 | 4 = 4 | 0 = 0 |
| 2026-08-23 | 28 = 28 | 1 = 1 | 2 = 2 | 2 = 2 |

Ledger left of `=`, PostHog right. Two readings that look like failures and are
not:

**2026-08-17 is excluded, not failed.** Ledger 129 digests against PostHog 85.
Per hour the two agree exactly from 15:00 Kyiv onward (13, 12, 9, 14, 13, 10, 4)
and diverge before it. PR #187 deployed at 15:22 +0300. The window opens with the
code that closes it, so its first day is a partial by construction.

**Feed clicks match only once the unattributable ones are excluded.** Raw
`surface=web_feed` in PostHog ran 3–23× the ledger (70 against 2 on 08-23). That
is not drift: `product_events.journey_id` is a `NOT NULL` foreign key, so a `/go`
tap with neither `?s=` nor `?j=` **cannot be written to the ledger at all** —
`applyClicked()` sends it straight to PostHog and returns. Comparing the
attributed subset reproduces the ledger exactly on all seven days, 08-17
included. The row below was mis-specified: as first written it could never have
passed, on any day, however healthy both systems were.

Compare the same half-open Kyiv interval `[from, to)` in both systems:

| Behaviour | Postgres ledger | PostHog |
|---|---|---|
| Digest delivered | `digest_sent` | `digest_sent` |
| Digest outbound click | `digest_link_clicked` | `vacancy_outbound_clicked`, `surface=telegram_digest` |
| Feed outbound click | `apply_clicked` | `vacancy_outbound_clicked`, `surface=web_feed` — **attributed only**: before 2026-08-24 add `is_anonymous != true`; after it the rename does this by itself |
| Activation | `telegram_linked` | `telegram_linked` |

The ledger keeps two names for a click; PostHog keeps one, split by `surface`.
That asymmetry is deliberate and ends with the ledger.

Phase 4 shipped on 2026-08-25 on the strength of this gate, plus a second
measurement of every rewritten query against the one it replaced. Those numbers,
and the three fields that had no source left, are in the tracker.

## Rollback

Nothing here is destructive, but the ledger is gone: there is no second store to
fall back on. If PostHog delivery or identity stitching regresses, the domain
tables still hold what we actually did — `sent_notifications` for every digest,
`subscriptions` for who exists and their lifecycle. Fix the producer against
those, not against an event store.
