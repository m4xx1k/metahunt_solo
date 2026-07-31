# Founder PostHog dashboard

PostHog is the source for acquisition, paths, funnels, retention, and product
behaviour. The application dashboard is deliberately limited to CRM and
delivery facts.

## One-time workspace setup

Automated path:

```bash
pnpm posthog:founder
POSTHOG_PERSONAL_API_KEY=phx_... \
POSTHOG_ORGANIZATION_ID=... \
POSTHOG_PROD_PROJECT_ID=... \
POSTHOG_LOCAL_PROJECT_ID=... \
pnpm posthog:founder -- --apply
pnpm posthog:founder -- --verify
```

Use a personal API key with `project`, `dashboard`, `action`, `insight`, and
query scopes. Do not use the `phc_` ingestion/project token.

The script is idempotent: `--apply` creates or updates the transition Action,
the dashboard, and the saved HogQL insights below; `--verify` checks the same
objects without mutating PostHog, including that each insight is attached to
the founder dashboard.

1. Rename the production project to `MetaHunt — PROD` and the local project to
   `MetaHunt — LOCAL / DEV`. Never point a local key at production.
   Set `NEXT_PUBLIC_ANALYTICS_TEST_TRAFFIC=true` outside production; production
   leaves it unset. Server events inherit the same `is_test` flag from journey
   classification.
2. Set both projects and the founder dashboard to `Europe/Kyiv`.
3. Create a dashboard named `Founder — acquisition and activation` in PROD.
   Its global filters must exclude `is_test=true` and use project timezone.

## Dashboard cards

- Live insight: unique visitors and `page_viewed`, split by `page_type`.
- Paths from `page_viewed`; inspect entry paths after every public talk.
- Trends: first `utm_source`, `utm_campaign`, `referrer_domain`, country, and
  device. These are bounded values only; no URL query strings or profile data.
- Recent activity: `page_viewed`, `vacancy_outbound_clicked`, authentication,
  and subscription lifecycle events.
- Funnels: `page_viewed → landing_cta_clicked → subscription_created →
telegram_linked`; `page_viewed → vacancy_outbound_clicked`; match onboarding;
  and authentication. The vacancy funnel breaks `vacancy_outbound_clicked` by
  `surface` (`web_feed` or `telegram_digest`).

For history, make one PostHog Action named `vacancy_outbound_any` that matches
`apply_clicked`, `digest_link_clicked`, and `vacancy_outbound_clicked`. Use that
Action in transitional funnels until the old-event retention window expires.

The automated dashboard seeds these saved insights:

- `MET-114 — live visitors and page views`
- `MET-114 — entry paths after talks`
- `MET-114 — first-touch source and campaign`
- `MET-114 — vacancy outbound by surface`
- `MET-114 — Telegram radar funnel`
- `MET-114 — vacancy click funnel`
- `MET-114 — CV match onboarding`
- `MET-114 — auth funnel`
- `MET-114 — recent activity`

## Meetup procedure

1. Open Live five minutes before speaking and record the start time as a
   dashboard annotation titled with the talk name.
2. Use a distinct, bounded `utm_campaign` for every published link.
3. For spoken links without UTM, annotate the talk interval and report it as an
   **inferred time cohort**, never as a proven source.
4. After the talk, compare the annotation window with entry paths and the
   source/campaign table; save the insight URL in the event notes.

## Access boundary

This repository only has ingestion keys. Project rename, timezone, and saved
dashboard creation require a PostHog owner in the UI or a personal API token;
an ingestion key must never be used or exposed for administration.
