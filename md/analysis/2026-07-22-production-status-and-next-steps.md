# MetaHunt: production status and next steps

**Recorded:** 2026-07-22  
**Source:** production inspection and repository audit after PRs
[#93](https://github.com/m4xx1k/metahunt_solo/pull/93) and
[#94](https://github.com/m4xx1k/metahunt_solo/pull/94).

## Verdict

MetaHunt is no longer an ETL prototype. It is a working production product with
this end-to-end shape:

```text
DOU + Djinni
-> collect and structure vacancies
-> deduplicate
-> public filters or CV matching
-> Telegram subscription
-> scheduled digest
-> attributed click to the source vacancy
```

The code is on `main`, web and API production are healthy, CI is green, and the
database contains active subscriptions and recorded deliveries. The product is
ready for five controlled production testers and a founder-led cohort of 20
qualified users. It is not ready for paid acquisition until identity joining,
activation, relevance, and seven-day click retention are measured.

**Launch verdict:** founder-led cohort is a conditional go after controlled
Telegram E2E; paid traffic is a no-go until the measurement gates pass.

## Delivered release

- PR #93 merged as `f71cff8` (`feat: ship a measurable first-user funnel`).
- PR #94 merged as `451a3e8` (`docs: record first-user funnel production rollout`).
- The repository was clean and synchronized with `origin/main` at inspection.
- The feature release changed 65 files: 4,768 additions and 166 deletions across
  backend, web, Telegram, analytics, auth, migrations, privacy, and runbooks.

## Current production evidence

The following values were checked on 2026-07-22:

| Component                                | Result                              |
| ---------------------------------------- | ----------------------------------- |
| `https://www.metahunt.app/radar/backend` | HTTP 200                            |
| `https://www.metahunt.app/privacy`       | HTTP 200                            |
| `https://api.metahunt.app/healthz`       | HTTP 200                            |
| Postgres health                          | `ok`, 7 ms at inspection            |
| Object storage health                    | `ok`, 101 ms at inspection          |
| Temporal health                          | `ok`, 1 ms at inspection            |
| Railway deployment                       | `SUCCESS`, running replica          |
| Last-hour HTTP snapshot                  | 13 requests, all 2xx, no 4xx or 5xx |
| HTTP latency                             | p50 79 ms, p95 110 ms               |
| Memory                                   | approximately 259 MB of 8 GB        |

Production database aggregates at inspection time:

| Metric                                             |                     Value |
| -------------------------------------------------- | ------------------------: |
| Total subscriptions                                |                        15 |
| Active and Telegram-linked subscriptions           |                         8 |
| Pending unlinked subscriptions                     |                         1 |
| Active feed subscriptions                          |                         5 |
| Active CV subscriptions                            |                         3 |
| Active subscriptions with any recorded delivery    |                         7 |
| Active subscriptions without a recorded delivery   |                         1 |
| Subscriptions with historical deliveries           |                        12 |
| `sent_notifications` vacancy-level records         |                       767 |
| Vacancy records sent during the preceding 24 hours | 14 across 2 subscriptions |
| Telegram-authenticated accounts                    |                         2 |
| User candidate profiles                            |                        16 |
| Seeded sample profiles                             |                         5 |

These aggregates prove that production is not empty and that scheduled delivery
is active. They do not prove the number of external users: one person may own
multiple subscriptions, and owner/test/legacy activity is not currently labeled.
The 767 sent-notification rows are vacancy-level anti-duplicate records, not 767
Telegram messages or clicks.

## Primary product path

The recommended acquisition product is the Backend role radar:

```text
/radar/backend
-> POST /subscriptions with the Backend preset
-> Telegram deep link
-> /start <opaque subscription UUID>
-> telegram_linked
-> immediate matches or a truthful zero state
-> scheduled digest
-> attributed vacancy click
```

It does not require a CV, site account, email, or Telegram Login Widget. This is
the lowest-friction and lowest-privacy-risk first offer.

The focused landing provides one ICP and promise, live supply proof, DOU and
Djinni scope, a daytime notification schedule, stop controls, UTM attribution,
subscription creation, and Telegram handoff. Public metadata, canonical URLs,
robots, sitemap, privacy disclosure, and noindex boundaries are also deployed.

## CV demo and privacy boundary

Public demo matching is available only for seeded samples through
`GET /cv/samples/:id/matches`. A seeded sample returns results, a non-sample
candidate is hidden, and the legacy protected endpoint still requires JWT and
ownership. This restores proof-before-auth without exposing uploaded CVs.

CV text is processed without being intentionally persisted as a raw file by the
application, but third-party model processing, provider logs, backups, analytics
consent, legal-controller language, and retention policy still require explicit
owner decisions.

## Telegram activation and delivery

Implemented behavior:

- pending subscriptions activate through an opaque deep-link UUID;
- equivalent links are serialized and deduplicated;
- repeated `/start` is idempotent;
- a fresh link immediately renders up to three current matches or an explicit
  zero-match state;
- preview failure does not reverse successful activation;
- `/stop`, unsubscribe buttons, and `/list` give user controls;
- sent-vacancy records prevent duplicate delivery;
- one subscriber failure does not starve later subscribers.

The immediate-preview path is implemented and tested in the repository, but has
not yet been proven five consecutive times through the real production Telegram
boundary.

### Observed delivery risk

At 09:30 and 10:30 UTC, one active subscription failed with
`TelegramChatUnreachable`, while another subscription continued to receive a
new digest. The failure is non-retryable within one Temporal activity, but the
subscription remains active and is tried again in the next scheduled cycle.

This preserves automatic recovery if a user unblocks the bot, but recurring
unreachable chats will create hourly noise and wasted work. Before scaling,
track consecutive unreachable results, suspend delivery after a bounded number
of failures, restore it on a new Telegram interaction, and avoid emitting raw
subscription UUIDs in human-readable logs.

## Authentication and deletion

Self-service `DELETE /me` transactionally removes the current identity, related
subscriptions, sent-notification rows through cascade, CV ownership links, and
the candidate when the account was its final owner. Same-chat cold alerts are
also removed. The JWT guard reloads the account and roles on every protected
request, so deleted accounts and stale admin claims cannot continue using old
tokens. Telegram login is rate-limited to 10 attempts per IP per minute.

Migration `0028` deployed the required user-to-subscription and
subscription-to-notification `ON DELETE CASCADE` constraints. This application
operation does not automatically erase historical analytics events, provider
logs, or backups.

## Analytics event contract

Immediate activation funnel:

```text
landing_view
-> landing_cta_clicked
-> subscription_create_started
-> subscription_created
-> subscription_handoff_opened
-> telegram_linked
-> activation_value_shown
-> digest_link_clicked
```

Scheduled retention funnel:

```text
telegram_linked
-> digest_evaluated
-> digest_sent
-> digest_link_clicked
```

Operational outcomes:

```text
digest_evaluated(result=matches|empty)
-> digest_sent | digest_delivery_failed
```

The server exposes first-digest state, feed-versus-CV profile type, zero-match
evaluations, and bounded `chat_unreachable` versus `transient` failures. Stable
insert IDs prevent Temporal retries from multiplying outcome events.

The browser currently aliases its anonymous PostHog identity to the opaque
subscription UUID after creation, and server events use that subscription UUID.
This is the intended browser-to-server join. It has not yet been proven in the
production PostHog project, and no production funnel/dashboard has been created
because management/query access was unavailable during the rollout.

## Verification status

Local/full validation after the auth fix:

- ETL: 57 suites and 324 tests;
- integration: 10 suites and 36 tests;
- web: 4 suites and 48 tests.

The `main` CI runs for both merge commits passed ETL tests, ETL integration,
web lint, ETL lint, database build, web tests, and the full build.

The first Railway deployment candidate failed its health check because the new
JWT guard required `AuthService`, but `AuthModule` did not export it into the
consumer module scope. The module export and a regression test were added, the
next deployment succeeded, and the previous healthy replica served traffic
throughout. No outage was observed.

## What remains unproven

1. Five complete production chains from landing through Telegram value, click,
   repeated `/start`, and `/stop`.
2. Correct joining of browser, server, Telegram, and optional account events into
   one analytics person/journey.
3. Production conversion baselines for every acquisition and activation step.
4. Real-user relevance ratings for the first three vacancies.
5. Seven-day click and retention baselines.
6. A labeled founder cohort and separation of owner/test/external traffic.
7. A production PostHog dashboard and named analytics owner.
8. Support ownership for the first 48 hours.
9. Approval of privacy, consent, provider retention, legal wording, and source
   permission/licensing posture.
10. Browser-based mobile, keyboard, screenshot, and Core Web Vitals evidence.

`/welcome` remains a lead dead-end without email delivery, export, attribution,
or a founder workflow and must not receive launch traffic. CV upload also remains
a higher-friction secondary path; the radar should remain the first offer.

## Rollout gates

### Gate 0: controlled production E2E

- five of five subscriptions reach `telegram_linked`;
- five of five show matches or an explicit zero state;
- repeated `/start` creates no duplicate;
- `/stop` prevents later delivery;
- browser and server events join correctly;
- no direct identity or CV content reaches analytics.

### Gate 1: founder cohort of 20 Backend users

- at least 8 of 20 link Telegram;
- at least 6 of those 8 receive a relevant vacancy within 24 hours;
- at least 3 of 8 click a Telegram vacancy within seven days;
- at least five complete a short interview;
- at least 60% rate two of their first three vacancies as relevant;
- unsubscribe is at most 20%;
- no privacy or support incident occurs.

### Gate 2: paid or sponsored experiment

Use one ICP, one landing, one channel, and at most 200 qualified sessions.

- Scale at landing-to-linked >= 10%, created-to-linked >= 60%, linked-to-value
  > = 80%, and seven-day click among linked users >= 30%.
- Iterate at 5-10% activation when relevance remains acceptable.
- Stop below 5% activation, above 30% irrelevant first alerts, on any P0/privacy
  incident, or with zero clicks among the first ten activated users.

Recommended channel order:

```text
personal invitations
-> one permissioned community post
-> one role-specific sponsored placement
-> only then a small paid campaign
```

## Immediate decisions and inputs

1. Use Ukrainian Middle/Senior Backend engineers as the first narrow ICP.
2. Keep the role radar as the primary offer and CV matching as secondary.
3. Provide five safe Telegram testers.
4. Provide production analytics query/dashboard access and name the owner.
5. Name the person monitoring delivery failures and user support for 48 hours.
6. Approve or edit privacy/DeepSeek wording, consent, retention, controller, and
   source-permission posture.
7. Select one initial recruitment channel; select a paid budget only after Gate 1.

## Bottom line

More feature work is not the immediate bottleneck. The next useful work is to
prove five complete activations, establish trustworthy identity and funnel
measurement, and then manually take 20 qualified people through the product.
That is the boundary between a functioning production service and validated
product usage.

## Implementation addendum

Branch `feat/analytics-ledger-dashboard` implements the measurement layer proposed
above: first-party journeys and critical events, shared browser/API/Telegram/worker
correlation, safe legacy backfill, internal account joins, and an admin-only product
funnel dashboard. The production run described by the owner was reconciled at
10:38 UTC (create, link, immediate preview) and 11:30 UTC (four delivered Backend
vacancies). Because it predates migration `0029`, it will appear as truthful legacy
delivery evidence rather than receive invented browser events. A new post-deploy
run is still required to prove the complete tracked journey in production.
