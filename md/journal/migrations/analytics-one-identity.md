# analytics-one-identity — finish the analytics cutover on one identity

**Branch:** `refactor/analytics-one-identity`
**Status:** in-progress (phase 4 unblocked 2026-08-24 — gate passed; the retirement itself is not started)
**Started:** 2026-08-16 · **Closed:** —

Continues [`analytics-real-metahunt-cutover.md`](analytics-real-metahunt-cutover.md), which shipped
steps 0–2 and stopped. This tracker carries the phases from the 2026-08-15 teardown audit
(three read-only audits cross-checked against production).

## Outcome

Phases 0–3 and 5 shipped. Identity is `subscriptions.person_id` end to end, the browser is unmuted
(`$pageview` on history changes, no stub, no allow-list, `$set_once` redaction fixed), one PostHog
client remains, and each store has exactly one author. PostHog is cleaned: starter dashboard and its
eight insights deleted, six replay playlists archived, authorized URLs set, cutover annotated, a
daily no-digest alert armed, and the internal cohort repointed at `is_staff`.

**Phase 4 is unblocked as of 2026-08-24 but not started.** Its condition was seven consecutive days
of PostHog reproducing the ledger's digest and click counts within 5%. The window ran 2026-08-18 to
2026-08-23 and produced six full days at **0.0%** divergence — the two stores agree event for event,
not merely inside the tolerance. The deploy day (08-17) is excluded for cause, and the seventh day
was waived by the owner rather than wait for a restatement. Full rows, both exclusions, and the
mis-specified feed-click comparison that had to be fixed before the gate could be read at all:
[`md/runbook/analytics-ledger-parity.md`](../../runbook/analytics-ledger-parity.md).

## Why this exists

The cutover left both halves running: the Postgres ledger writes at full volume, PostHog covers
~21% of digests, and two admin dashboards answer the same questions from different stores. Every
divergence traces to one rule — *"an unlinked subscription is not yet a person"* — plus a muted
browser layer. The person spine (`subscriptions.person_id`, populated 45/45) already exists and is
simply unused.

## Subtasks

- [x] T0 — Phase 0, clear the PostHog room (no code) — *done when:* one dashboard, three tiles, all returning data; authorized URLs set; cutover annotated
- [x] T1 — Phase 1, one identity: capture on `person_id`, alias on account link, `$set` profiles — *done when:* digest coverage reaches every active subscription and two clicks on one link land on one person
- [x] T2 — Phase 2, unmute the browser: real pageviews, no stub, no allow-list, `$set_once` redaction — *done when:* an anonymous visit produces a pageview and login merges its history
- [x] T3 — Phase 3, one registry, one writer, one client — *done when:* every event name has exactly one definition and at least one live emitter
- [ ] T4 — Phase 4, retire the ledger — **unblocked 2026-08-24**, not started: drop `product_events` + `analytics_outbox`, delete the funnel/channels/retention/growth panels, keep the roster, retarget the outbox at PostHog. Separate migration — do not mix with `subscriptions.user_id NOT NULL`.
- [x] T5 — Phase 5, make silent breakage loud: no-digest alert, staff flag, reachability in the catalog check — *done when:* unplugging an emitter surfaces within a day

## Verification status

The code gates are met in test; the two live gates need production traffic after deploy:

| Gate | Status |
|---|---|
| Phase 0 — one dashboard, three tiles, data | ✅ verified (digests + clicks return rows) |
| Phase 1 — full digest coverage, two taps one person | ✅ verified 2026-08-24: six days of digests reproduced exactly (127/101/103/103/29/28), one event per person per send |
| Phase 2 — anonymous visit produces a pageview, login merges it | ✅ verified 2026-08-17: 8 pageviews, two distinct ids merged into one person, `signed_in` on the same person |
| Phase 3 — one definition and one live emitter per name | ✅ `pnpm analytics:catalog`, reachability check verified against a planted unreachable event |
| Phase 4 — seven days of agreement | ✅ closed 2026-08-24: six full days at 0.0%, deploy day excluded, seventh waived |
| Phase 5 — unplug an emitter, hear about it within a day | ✅ alert armed (daily, fires below one digest) |

## Decisions

**Identity = `subscriptions.person_id`, not `users.id`.** A Telegram subscriber is a person on the
day they subscribe, not on the day they open a web account. `claimTelegramSubscriptions` already
rewrites `person_id` to `users.id` on link, so the spine converges on the account id without a
second identity scheme — the alias emitted at that moment is what merges the two PostHog persons.

**Answers to the audit's open questions (owner, 2026-08-16):**
1. The number-three clicker stays unattributed for now — not worth chasing.
2. The roster survives as a real page, not a saved query. Phase 4 deletes the funnel, channels,
   retention and growth panels around it.
3. Accept the identity discontinuity and annotate it. No fourth PostHog project.

**One author per store, not one store.** The audit's Rule 2 asks for exactly one forwarder into
PostHog. With both stores still alive that means: the outbox drains to Postgres only, and
`PostHogClient` writes PostHog directly from the domain services. Making the dispatcher forward to
PostHog as well would have double-counted every digest. When phase 4 drops `product_events`, the
outbox is retargeted to PostHog and becomes that single forwarder.

**Deviation — the ledger keeps `digest_link_clicked` / `apply_clicked`.** The audit asked for one
name everywhere including the ledger. PostHog now receives exactly one verb
(`vacancy_outbound_clicked`, split by `surface`) and the rename hack is deleted, but renaming the
ledger's two names would rewrite six admin queries that key on them — panels phase 4 deletes — and
risk miscounting historic rows. Not worth it for a table with a scheduled death.

**Server events are classified as `Automation` and that is correct.** PostHog derives
`$virt_is_bot` from the user agent at query time; server events have none. Faking one would be
lying to our own data. The rule instead: leave bot filtering off on product insights. Web Analytics
excludes server events, which is what Web Analytics is for.

**`journeyId` merges the person, it is not stored on the row.** The controller reads it now, and
the create path aliases the browser journey into the subscription's person — which is the half that
answers "did this visit become a subscriber". Persisting it into `subscriptions.journey_id` would
need the `analytics_journeys` row to exist first (it is a foreign key, and the browser no longer
creates journey rows), and a subscription create must never fail on analytics.

**An unnameable click is an event, not a person.** A `/go` hit with no subscription and no
journey still captures — the volume is real — but with `is_anonymous: true`, and every per-person
metric filters it out. Rule 3 forbids a synthetic identity, and the reason is arithmetic: the day
this shipped, 15 anonymous clicks read as 15 unique clickers on a product with three browser people.

**…and as of 2026-08-24 it gets its own name, not just a flag.** The flag protected per-person
metrics but not raw volume, and the volume turned out to be the whole story: unattributed taps ran
~30:1 against attributed ones (08-23: 68 against 2), so `vacancy_outbound_clicked` meant nothing to
anyone who forgot to filter. The fallback branch now emits `vacancy_outbound_unattributed`, leaving
the attributed verb clean by default. `is_anonymous: true` stays on it for continuity with the rows
already ingested under the shared name.

**The unattributed volume is not old users PostHog cannot recognise.** The theory was that people
who signed up before the cutover, then moved to Telegram, now land unattributed. The code says
otherwise: `ApplyLink.tsx` calls `getOrCreateJourneyId()` — *create* — so a journey id is minted in
localStorage on first render of a feed card, for any browser, regardless of when the account was
made. A real feed tap therefore always carries `?j=`, and a digest tap always carries `?s=`. A hit
with neither is not a returning human. `redirect.controller.ts` already filters `isbot` and
non-`navigate` `Sec-Fetch-Mode`, and passes an *absent* `Sec-Fetch-Mode` as human so Telegram in-app
taps survive — which is the gap a browser-UA crawler walks through. Tightening that is open work,
deliberately separate from the rename: the rename makes the number honest, it does not stop the
traffic.

**Browser events kept vs dropped (Rule 4 applied).** Kept: outcomes an outsider watching URLs and
clicks cannot infer — upload results, feedback sentiment, login failures, match-flow completion.
Dropped: clicks autocapture already sees (`lens_switch`, `*_started`) and account lifecycle the
server owns (`signed_in`, `account_created`).

## Phase 4 — execution brief

Owner decisions, 2026-08-24. Everything here is decided; do not re-open it, and do not
improvise on the roster.

### Scope correction — read this first

The line "drops the two tables and the funnel, channels, retention and growth panels, and
keeps the roster" understates the work by a wide margin. A scan of
`admin/product-analytics/product-analytics.service.ts` shows **14 of its 15 methods touch
`product_events` or `analytics_journeys`**, most through raw SQL rather than the drizzle
table objects (so grepping for `productEvents` alone under-reports it). Only `growth()` is
already ledger-free. Phase 4 is a rewrite of that service, not a deletion pass.

| Method | Disposition |
|---|---|
| `people`, `subscriberActivity`, `subscriberStates` | **Rewrite on PostHog.** This is the roster and it stays whole — see below. |
| `deliverySummary`, `deliveryDaily` | **Rewrite on `sent_notifications`**, not PostHog: it is the domain source of truth for "already sent" (composite PK, anti-join drives matching), so digests/day and messages-per-chat-per-day come straight from it. Failure-by-kind is already gone — owner dropped it 2026-08-25 once it turned out to be computed, typed, and rendered nowhere. |
| `orderedFunnel`, `channels`, `retention`, `feedEngagement`, `periodFlow` | **Delete** with their panels, as planned. PostHog answers these. |
| `recentJourneys`, `updateJourney`, `identityHealth` | **Delete.** All three exist to inspect or repair the ledger; they have no meaning once it is gone. `updateJourney` is how test journeys were marked — that job now belongs to the PostHog internal cohort. |
| `overview` | Recompose from whatever survives. |

### The roster is the decided exception

Owner chose to keep it whole rather than accept the loss. Two queries carry it, and both
read `product_events` today:

- `subscriberActivity` (~line 1229) — "last action" is `max(occurred_at)` over
  `USER_ACTION_EVENTS`, taken twice: once keyed on `journey_id` for browsing, once on
  `subscription_id` for digest/link events, then the newest of the two.
- `subscriberStates` (~line 488) — active / dormant / churned, where dormant is "active
  subscription, ≥3 digests in 14d, zero user actions". Shipped in #139.

Both are reproducible in HogQL: same event names, same `person_id` spine. Dormant is the
only early-warning signal for churn the product has — losing it silently is the one
outcome this brief exists to prevent.

### Order of work

1. Rewrite the roster trio and the delivery pair; prove them against the ledger **while
   both still exist** — that comparison is free now and impossible afterwards.
2. Delete the panels and methods marked Delete, with their contract types and UI.
3. Retarget the outbox at PostHog so it becomes the single forwarder, and drop
   `product_events`, `analytics_outbox`, `analytics_journeys` in a migration of their own.

### Proof — the rewrites measured against the ledger, 2026-08-25

Run before a line of the retirement was written, against production Postgres and
PostHog project 239290, with a fixed upper bound of `2026-08-25 14:00 UTC` on both
sides so the two stores see the same window. Scripts were throwaway; the numbers
are the record.

**The parity gate still holds, extended to today.** Same four behaviours, same
half-open Kyiv days, ledger `=` PostHog:

| Kyiv day | digest_sent | digest click | feed click | activation |
|---|---|---|---|---|
| 2026-08-18 | 127 = 127 | 8 = 8 | 14 = 14 | 2 = 2 |
| 2026-08-19 | 101 = 101 | 3 = 3 | 24 = 24 | 0 = 0 |
| 2026-08-20 | 103 = 103 | 5 = 5 | 8 = 8 | 0 = 0 |
| 2026-08-21 | 103 = 103 | 2 = 2 | 18 = 18 | 0 = 0 |
| 2026-08-22 | 29 = 29 | 1 = 1 | 4 = 4 | 0 = 0 |
| 2026-08-23 | 28 = 28 | 1 = 1 | 2 = 2 | 2 = 2 |
| 2026-08-24 | 53 = 53 | 0 = 0 | 21 = 21 | 0 = 0 |
| 2026-08-25 | 41 = 41 | 2 = 2 | 20 = 20 | 0 = 0 |

**Roster clicks and last action** — every person in the roster spine (51 rows:
27 accounts ∪ 34 subscription persons, deduplicated), post-cutover window:

| Field | New source | Result |
|---|---|---|
| `feedClicks` | `vacancy_outbound_clicked`, `surface=web_feed`, attributed | **51/51 people identical**, totals 8 = 8 |
| `telegramClicks` | `vacancy_outbound_clicked`, `surface=telegram_digest` | **51/51 identical**, totals 22 = 22 |
| `lastProductActionAt` | PostHog user-action set on the person | **49/51 identical** |

The two rows that differ, differ **upward**: PostHog carries `$pageview`s under a
browser distinct id that the alias merged into the person, and the ledger cannot
hold them at all — its browser ingest endpoint was deleted in phase 2. One reads
`∅ → 2026-08-20T11:15`, the other `2026-08-18T14:14 → 2026-08-19T16:38`. Both were
read event by event and are pageviews. The new query is never blinder than the old
one on this field, only sharper.

**Subscriber states** — the panel this brief exists to protect. Chat spine and
`is_active` from `subscriptions`, digests from `sent_notifications`, user actions
from PostHog:

| Dormancy window | Old (ledger) | New | Agreement |
|---|---|---|---|
| 14d, 08-11 → 08-25 | 18 active / 9 dormant / 5 churned | 17 / 10 / 5 | **31/32 chats** |
| 7d, 08-18 → 08-25 | 16 / 11 / 5 | 16 / 11 / 5 | **32/32 chats** |
| 5d, 08-20 → 08-25 | 15 / 12 / 5 | 15 / 12 / 5 | **32/32 chats** |

The single chat that moves on the 14-day window is chat `662831789`: three
`digest_link_clicked` on 2026-08-13 keep it `active` in the ledger, and PostHog
holds **no event at all for that person before 2026-08-17** — the cutover date.
It is the pre-cutover history gap, not a defect in the rewrite, and it closes by
itself on **2026-08-31**, when a 14-day window first lies wholly inside the
covered era. Every window that already does agrees chat for chat.

**Delivery** — `sent_notifications` reproduces `digest_sent` by grouping rows on
`(subscription_id, date_trunc('hour', sent_at))`. Digests are hourly, so the hour
is the send. Measured over every day since the ledger began:

| Comparison | Result |
|---|---|
| Groups vs events, all-time since ledger start (2026-07-23) | 2541 groups, 2546 events, **2540 matched** |
| Groups vs events, last 30 days | 2491 groups, 2490 events, **2490 matched**, 0 duplicate groups |
| Digests per Kyiv day, 08-11 → 08-24 | **13 of 14 days exact**, one day off by one |
| Distinct subscriptions reached per day, 08-13 → 08-24 | **12 of 12 days exact** |

Both sides of the residue were read row by row. The 6 ledger-only events are all
from 2026-07-23, the ledger's first day, and carry a **null `subscription_id`** —
they cannot be matched to a chat by construction. The 1 group-only row is chat
`7ee17ab7`'s 08-13 08:30 send, which has a `digest_delivery_failed` against it: the
vacancy rows were written and the message never landed. `sent_notifications`
counts the attempt, the ledger counted the success. That is one send in 2541.

**`telegramLinkedAt` needs no analytics store at all.** `subscriptions.linked_at`
is the domain fact and already the fallback in the shipped code. Against the
ledger: 40 of 40 `telegram_linked` events land **within 5 seconds** of the
subscription's `linked_at`, zero events exist without one, and `linked_at` covers
41 subscriptions to the ledger's 40. Moving the field to the column is a small
gain, not a loss.

### Three fields the ledger cannot hand over

Measured, not assumed. Their producers are already dead — the browser ingest
endpoint went away in phase 2, so these stopped being written weeks before this
work started:

| Field | Last real value | Disposition |
|---|---|---|
| `SubscriberActivity.ctaClickedAt` | `landing_cta_clicked`, last seen **2026-07-31** | **Deleted.** Computed, typed, rendered nowhere — the same shape #196 removed from Delivery, on the owner's own precedent. |
| `SubscriberActivity.firstSeenAt` | first ledger event on the journey | **Deleted.** Rendered nowhere, and `joinedAt` (earliest `subscriptions.created_at`) is the truthful version of the same question — the contract already says so. |
| `SubscriberActivity.source` | `landing_view` utm/referrer, last seen **2026-08-03** | **Rewritten on PostHog `$referring_domain`**, folded through the existing `resolveChannelSource`. It *is* rendered (Users panel, "from"), so it keeps a source rather than being dropped — but only 3 of 32 chats can be attributed today, because 29 of them arrived before the browser was unmuted. |

Nothing else in the roster, the states or the delivery pair lost a source.

### Constraints

- **Backup taken 2026-08-24:** `backups/Postgres-1787610415466.sql.gz` (291 MB, prod).
  Owner waived the restore-test; do not spend time on one, and do not take another.
- **Separate migration.** Do not mix the drop with `subscriptions.user_id NOT NULL`.
- **`?j=` survives the drop.** `analytics_journeys` disappears, but `ApplyLink.tsx` must
  keep stamping the journey id: post-drop it is the PostHog alias that ties an anonymous
  visit to the subscriber, and it is half of what tells an attributable click from a
  crawler's. Removing it re-breaks what #193 fixed.
- **Do not touch `redirect.controller.ts`.** The crawler gap is deliberately after phase 4.

## Links

- Runbook (daily check + the parity gate): `md/runbook/analytics-ledger-parity.md`
- Prior tracker: `md/journal/migrations/analytics-real-metahunt-cutover.md`
- Audit: Metahunt Analytics Teardown (artifact, 2026-08-15)
- PR: …
