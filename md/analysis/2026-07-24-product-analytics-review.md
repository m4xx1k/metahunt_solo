# Product analytics review — 2026-07-24

Post-launch audit of what we actually measure, what's trustworthy, and what to fix.
Source: PostHog project 194218 (EU), 14-day window, queried directly. Dashboard
[841775](https://eu.posthog.com/project/194218/dashboard/841775).

## Verdict

Measurement is **good enough to steer by, with one metric poisoned and one blind spot**.
The funnel is real and the numbers are encouraging on tiny n; the damage is concentrated in
`apply_clicked` (crawlers), notification volume (unmeasured until now), and error visibility
(a failure event that has never fired).

## The funnel, end to end (14 days, real query)

| step | persons | step conv | overall |
|---|---|---|---|
| `landing_view` | 20 | — | 100% |
| `subscribe_clicked` | 6 | 30% | 30% |
| `subscription_created` | 6 | 100% | 30% |
| `telegram_linked` | 5 | 83% | 25% |
| `activation_value_shown` | 5 | 100% | 25% |
| `digest_link_clicked` | 5 | 100% | **25%** |

Median timings: landing→subscribe 15s, subscribe→created 2s, created→linked 8s,
linked→first digest click 55s. **One in four people who see a landing ends up clicking a
job from Telegram.** For a cold-start product that is a strong signal — and it says the
bottleneck is traffic, not the product (which matches the day-1 read).

By channel (unique persons, first-touch `$initial_utm_source`):

| source | landings | subscriptions | digest clickers |
|---|---|---|---|
| reddit | 15 | 5 | 4 |
| (none — legacy / Telegram-first / crawlers) | 4 | 8 | 5 |
| gf_test (founder) | 1 | 1 | 1 |
| ig_text_post_permalink | 0 | 0 | 1 |

Reddit converts at **33% landing→subscription**. The day-1 note said "4 visits"; over the
full week it is 15 persons — the post kept trickling.

## P1 — `apply_clicked` is still mostly crawlers (metric poisoned)

The bot filter that shipped today (#111) helped but did not close it:

| window (2026-07-24 UTC) | new persons | phantom (1 event, 0 pageviews) | real sessions |
|---|---|---|---|
| before 12:00 (pre-deploy) | 174 | 146 (84%) | 24 |
| after 12:00 (post-deploy) | 26 | 18 (69%) | 8 |

14-day totals: `apply_clicked` = 1367 events across **1354 distinct persons** — a 1:1
event-to-person ratio is the crawler signature (every hit mints a fresh anonymous person).
Real humans in the same window: 20 `landing_view` persons.

Two things follow:

1. **Any person-level metric in PostHog is inflated** — unique users, conversion over "all
   persons", retention cohorts. Only funnels anchored on `landing_view` (browser-side) are
   safe today.
2. `isbot` on the User-Agent is the wrong discriminator on its own. The survivors have
   browser-shaped UAs (link unfurlers, scanners, unknown crawlers).

**Fixes, cheapest first:**

- **Stop minting persons for unattributed clicks.** One of the two `apply_clicked` code
  paths already sends `$process_person_profile: false`; the other doesn't (it sets
  `$insert_id: apply_clicked:<uuid>` instead). Make the no-journey path always send
  `$process_person_profile: false` — the event still counts, PostHog stops creating a
  person, and the person-level metrics clean themselves up going forward.
- **Require a browser signature on `/go/:id`.** Real navigations send `Sec-Fetch-Mode:
  navigate` (and `Sec-Fetch-Site`); crawlers and unfurlers essentially never do. Record the
  click only when those headers look like a navigation — strictly better than a UA list,
  and it needs no allowlist maintenance.
- **`X-Robots-Tag: noindex` + `robots.txt` disallow for `/go/`.** Redirect endpoints should
  never be crawlable in the first place.

## P2 — notification volume is a churn risk (new finding)

Nobody was watching send frequency. Measured:

| day | digests | chats | per chat | vacancies sent | max pages |
|---|---|---|---|---|---|
| 07-15 | 31 | 4 | **7.8** | 38 | 1 |
| 07-16 | 29 | 4 | 7.2 | 44 | 1 |
| 07-22 | 19 | 3 | 6.3 | 34 | 1 |
| 07-23 | 21 | 5 | 4.2 | 52 | 3 |
| 07-24 | 31 | 9 | 3.4 | 53 | 1 |

**4–8 messages per chat per day.** The failed sends on 07-22 show what the tail looks like:
one digest with `pages: 7, vacancies: 297`.

Both `unsubscribed` events (07-23 11:30, 07-24 06:30, `method: button`) landed **on a digest
hour**, i.e. immediately after a delivery. Two unsubscribes against ~9 `telegram_linked` in
14 days is ~20% churn.

n = 2, so this is a hypothesis, not a proven cause. It is also the cheapest hypothesis to
kill: **cap sends (1–2/day, or make frequency a subscription setting) and cap items per
digest.** If churn continues after the cap, the cause is relevance, not volume — and that's
a different fix.

## P3 — unreachable chats are retried forever

On 07-22, `digest_delivery_failed` fired with `failure_kind: chat_unreachable` for the same
chats **every hour** (12:30 → 18:30, identical subscription hashes, `pages: 7,
vacancies: 297`). A blocked bot / dead chat never recovers on its own, so the hourly
scheduler burns a send per hour per dead chat and inflates the failure series.

**Fix:** after N consecutive `chat_unreachable` results, deactivate the subscription (and
record why). `transient` failures should keep retrying — those also appeared on 07-22 and
stopped on their own.

## P4 — instrumentation gaps

- **`landing_view` carries almost nothing.** Its only real property is `landing_variant` —
  no `utm_source`, no `$pathname`, no journey id. Channel analysis works *only* through
  person-level `$initial_utm_source`, which means: no per-landing comparison
  (`/radar` vs `/radar/backend` vs `/match`), and no channel breakdown on the event itself.
  Add `utm_*` + `path` to the event payload.
- **`subscription_create_failed` has never fired.** Not in the event taxonomy at all → we
  are blind to subscribe errors. Either it isn't wired up, or it is wired to a branch that
  never executes. Verify with a deliberate failure.
- **`apply_clicked` has no source dimension.** Only `vacancyId`. Feed click vs digest click
  vs crawler is not separable inside PostHog — which is exactly why P1 was invisible for two
  weeks. Add `source` (`feed` | `digest`) and the journey id when present.
- **Event history starts at different dates.** `apply_clicked` from 07-10, `landing_view` /
  `landing_cta_clicked` / `subscription_create_started` / `activation_value_shown` from
  07-22, `digest_evaluated` from 07-22. Any "all time" funnel silently mixes eras — keep
  windows ≤ 30d until 07-22 falls out of range.

## What's healthy (don't touch)

- The dual sink works: first-party `product_events` ledger + PostHog under one journey id.
- Person-level first-touch attribution is intact (`reddit`, `com.reddit.frontpage`, `gf_test`
  all cleanly separable).
- The newest instrumentation fires in production the day it shipped: `match_scored` (3),
  `match_flow_started` (1).
- `digest_evaluated` (255 in 2 days) gives evaluation-vs-send visibility, so "why no digest"
  is answerable.

## Dashboard changes made today

Added to [841775](https://eu.posthog.com/project/194218/dashboard/841775) — it previously had
only `subscribe_clicked → subscription_created → telegram_linked` and a daily signup trend:

| insight | what it answers |
|---|---|
| [Activation funnel — landing → digest click](https://eu.posthog.com/project/194218/insights/CcFEalTq) | the real 6-step funnel, 14d conversion window |
| [Channels — landings, signups, digest clicks](https://eu.posthog.com/project/194218/insights/Hfew7Krd) | which source produces activated users |
| [Digest load, clicks and churn](https://eu.posthog.com/project/194218/insights/wNACrGNM) | sends vs clicks vs unsubscribes vs failures |
| [Feed clicks — events vs persons (bot gauge)](https://eu.posthog.com/project/194218/insights/s4kBt1WL) | is the bot filter holding (lines apart = humans) |

Note: `$virt_is_bot` / `$virt_traffic_type` are **useless here** — PostHog classifies every
server-sent event (`posthog-node`) as `Automation`, including `landing_view` and
`telegram_linked`. Don't build filters on them; use the event-vs-person ratio instead.

## Worth learning (short list, in order of payoff)

1. **PostHog's person model** — anonymous vs identified persons, `$process_person_profile`,
   and why server-side events with per-request distinct ids destroy person metrics. This is
   P1's root cause and the one concept that would have prevented it.
2. **First-touch vs last-touch attribution** — `$initial_utm_source` is a *person* property
   frozen at first sight; event-level `utm_*` is per-event. Knowing which one a chart uses is
   the difference between "Reddit converts at 33%" and a wrong number.
3. **Funnel semantics** — conversion window, ordered vs unordered steps, and why a step
   added later (07-22) truncates every earlier cohort.
4. **Notification-product economics** — unsubscribe-per-send as the steering metric,
   frequency caps, digest fatigue. Any alerting product lives or dies here, and we now have
   the first evidence of it.
5. **Small-n discipline** — with 20 landings and 5 activations, the honest statements are
   "direction" and "no counter-evidence", never "conversion is 25%". The current biggest risk
   is over-reading these numbers and building the wrong thing next.

## Ordered next actions

| # | action | why | effort |
|---|---|---|---|
| 1 | `$process_person_profile: false` on unattributed `apply_clicked` | unpoisons every person metric | XS |
| 2 | `Sec-Fetch-Mode` gate + `noindex` on `/go/:id` | stops the click inflation at the source | S |
| 3 | Frequency cap on digests (1–2/day) + items-per-digest cap | the only churn signal we have points here | S |
| 4 | Deactivate after N `chat_unreachable` | stops burning sends on dead chats | S |
| 5 | Add `utm_*` + `path` to `landing_view`; `source` + journey to `apply_clicked` | makes channel/landing/source analysis possible in PostHog | S |
| 6 | Verify `subscription_create_failed` actually fires | removes the last blind spot on the signup path | XS |
| 7 | Then, and only then, buy more traffic (DOU, UA IT Telegram) | 33% channel conversion deserves a bigger top of funnel | — |

Items 1–2 are measurement hygiene; 3–4 are product behaviour; 5–6 are instrumentation.
None of them require touching the console UI shipped in `feat/operator-console`.
