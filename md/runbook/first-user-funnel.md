# First-user funnel

## Event contract

The browser aliases its current PostHog visitor to the opaque subscription UUID
after `POST /subscriptions` succeeds. Server events use that same UUID as
`distinct_id`, so browser and Telegram steps join without account, Telegram,
email, CV, filename, or filter values.

New account logins emit `logged_in` anonymously and do not identify the account
UUID. Do not add Telegram chat IDs or account IDs as funnel properties.

| Stage | Event | Required properties |
|---|---|---|
| Landing view | `landing_view` | bounded UTM fields, `landing_variant` |
| CTA intent | `landing_cta_clicked` | attribution, destination |
| Create intent | `subscription_create_started` | `profile_type`, `filter_count` |
| Created | `subscription_created` | `filterCount` |
| Telegram handoff | `subscription_handoff_opened` | `profile_type` |
| Linked | `telegram_linked` | result |
| Immediate value | `activation_value_shown` | matches, shown, result |
| Scheduled evaluation | `digest_evaluated` | matches, result, `is_first_digest`, `profile_type` |
| Delivery success | `digest_sent` | vacancies, pages, `is_first_digest`, `profile_type` |
| Delivery failure | `digest_delivery_failed` | failure kind, failed page, `is_first_digest`, `profile_type` |
| Vacancy click | `digest_link_clicked` | vacancy UUID |

`digest_evaluated.$insert_id` is stable across Temporal retries for one
subscription activity. A manual operator run gets a new evaluation ID. Delivery
failure IDs are stable for the same vacancy set and failed page. Never attach
raw error messages: they may contain provider or user context.

## Saved views

### A. Immediate activation

Ordered funnel, seven-day conversion window:

```text
landing_view
→ landing_cta_clicked
→ subscription_create_started
→ subscription_created
→ subscription_handoff_opened
→ telegram_linked
→ activation_value_shown
```

Break down by `utm_source`, `utm_medium`, `utm_campaign`, `creative_id`,
`landing_variant`, and `profile_type`. Start with `/radar/backend`; do not mix
`/welcome` traffic into this view.

### B. First useful click

```text
telegram_linked
→ activation_value_shown
→ digest_link_clicked
```

The immediate preview uses the historical attributed-click event, so this view
measures first value whether the click happens immediately or after a scheduled
digest. Use event timestamps to report median time-to-click.

### C. Scheduled retention

```text
telegram_linked
→ digest_evaluated  (result = matches)
→ digest_sent
→ digest_link_clicked
```

Keep this separate from immediate activation. It answers whether MetaHunt keeps
finding and delivering new work after the first session.

### D. Operational health

Create three daily trends in `Europe/Kyiv`:

1. Pre-first-delivery outcomes: unique subscriptions with `digest_evaluated`,
   filtered by `is_first_digest = true`, broken down by `result` and
   `profile_type`. The flag remains true through empty evaluations until that
   subscription records its first delivered vacancy.
2. Delivery reliability: unique `digest_sent` versus unique
   `digest_delivery_failed`, broken down by `failure_kind`.
3. Time-to-value: median duration from `telegram_linked` to
   `activation_value_shown`, plus p90.

Exclude controlled test campaigns from acquisition reporting but keep them in a
separate verification view. Record the exact exclusion property in the saved
view description.

## Deploy verification

For each of five approved test subscriptions, record UTC timestamps for:

1. landing view and CTA;
2. subscription create and handoff;
3. Telegram link and immediate value;
4. one attributed vacancy click;
5. `/stop` or individual unsubscribe.

Acceptance:

- 5/5 chains join to one PostHog person each;
- 5/5 show matches or an explicit empty state;
- repeated `/start` does not duplicate the subscription or value event;
- no account ID, Telegram ID, CV content, filename, or full filter appears in
  event properties;
- a forced safe delivery failure appears only as a bounded failure kind;
- `/stop` prevents later delivery.

## Production baseline — 2026-07-22

- Main commit `f71cff8` is live on Vercel and the focused landing, privacy,
  robots, and sitemap routes return `200` with their expected content.
- Railway deployment `0e3e25ef-f8ef-411b-8edc-f098e2b61814` is `SUCCESS`.
  `/healthz` reports Postgres, storage, and Temporal healthy; the worker reached
  `RUNNING`; the observed 15-minute HTTP smoke window had no 5xx responses.
- Migration `0028` is applied: both account → subscription and subscription →
  notification foreign keys report `ON DELETE CASCADE` in production.
- A seeded sample match returns `200`, a real non-sample candidate through the
  public sample path returns `404`, and the legacy path without JWT returns
  `401`.
- One anonymous Backend-preset create returned a valid UUID and matching HTTPS
  Telegram start link. It was not linked to a user and will follow the normal
  pending-subscription cleanup window.

This proves the public HTTP handoff, not Telegram activation. The five user-side
`/start` → value → click → `/stop` chains and PostHog joining remain required.

## Traffic gates

- Founder cohort: 20 qualified Backend/Full-stack users; at least 8 link
  Telegram, 6 see a relevant vacancy within 24 hours, and 3 click within seven
  days.
- Paid test: one channel and landing, maximum 200 qualified sessions.
- Scale at ≥10% landing → linked, ≥60% created → linked, ≥80% linked → value,
  and ≥30% seven-day vacancy click among linked users.
- Stop below 5% activation, on any privacy/support incident, or when more than
  30% of rated first alerts are irrelevant.

The production dashboard URL and owner remain intentionally blank until the
owner confirms PostHog access. Add them here after creating the saved views.
