# MetaHunt audit and next steps

**Audit date:** 2026-07-21 · **production verification:** 2026-07-22

**Delivery:** `feat/real-user-funnel` merged as PR
[`#93`](https://github.com/m4xx1k/metahunt_solo/pull/93), main commit `f71cff8`

**Traffic verdict:** paid traffic **No-Go**; founder-led cohort **Conditional Go**
after controlled Telegram E2E.

## 1. Executive summary

MetaHunt is no longer an ETL prototype. Its strongest real product is a
candidate-first job radar for the Ukrainian tech market:

```text
DOU + Djinni
→ structured and deduplicated vacancies
→ public filters or CV-ranked matches
→ Telegram subscription
→ new-vacancy digest
→ attributed click to the original job
```

The July release history shows a deliberate launch-hardening cycle: Telegram
auth, account-bound CVs, click attribution, API protection, truthful extraction
outcomes, CORS restriction, analytics privacy, subscription-link idempotency,
CI, and bounded ingest concurrency all shipped before this audit.

The strongest offer is not “AI job aggregator.” It is:

> Stop checking DOU and Djinni manually. MetaHunt removes repeat listings and
> sends new jobs matching your role and filters to Telegram.

Three risks still block paid acquisition:

1. Production has no verified end-to-end funnel or 7/30/90-day conversion
   baseline. The product can emit several events, but nobody has yet proved that
   one controlled visitor appears coherently from landing through digest click.
2. Alert relevance has no real-user baseline. Production now exposes the focused
   landing, public sample proof, immediate Telegram preview, and scheduled
   outcome events, but no qualified cohort has rated its first alerts.
3. Trust and operations need explicit ownership. Raw CV text is not persisted by
   MetaHunt, but it is sent to DeepSeek. Public disclosure and transactional
   self-service account deletion are now in production; provider retention,
   analytics consent, legal wording, and support ownership still require an
   owner decision.

Recommended next 7–14 days:

- run five controlled Telegram subscriptions end to end;
- build one PostHog funnel from the stable events below;
- recruit 20 Middle/Senior Backend or Full-stack users manually;
- sample their first three alerts for relevance;
- buy traffic only if activation and quality pass the stated gates.

## 2. System and user-flow map

### Supply flow

```text
Temporal schedule
→ DOU/Djinni RSS fetch
→ raw record storage
→ DeepSeek structured extraction
→ verified taxonomy resolution
→ latest-record-wins vacancy load
→ semantic/same-source dedup
→ public feed and matching APIs
```

Operational boundaries are described in
[`md/architecture/overview.md`](md/architecture/overview.md). The latest ingest
hardening is commit `af1b19b` and its tracker is
[`md/journal/migrations/ingest-pipeline-refactor.md`](md/journal/migrations/ingest-pipeline-refactor.md).

### Shortest activation flow: role radar

```text
/radar/backend
→ POST /subscriptions with Backend role + 30-day freshness
→ t.me deep link
→ /start <opaque subscription UUID>
→ telegram_linked
→ hourly daytime evaluation
→ digest_sent when a new match exists
→ /go/:vacancy?s=:subscription
→ digest_link_clicked
```

This flow needs neither a CV nor a site account. It is the recommended first
offer because it minimizes privacy, authentication, and extraction friction.

### Secondary activation flow: CV matching

```text
Telegram login
→ PDF/TXT upload
→ in-memory text extraction via DeepSeek
→ owner-bound derived candidate profile
→ ranked warm feed + skill recommendations
→ owner-bound Telegram subscription
→ digest and attributed original-job click
```

The anonymous proof path uses only seeded sample candidates. Commit `13784db`
adds `GET /cv/samples/:id/matches`; it checks `candidate.type = sample` before
ranking and leaves every user-uploaded candidate behind JWT ownership checks.

## 3. Technical delivery and production state

Production checks after PR `#93` deployed on 2026-07-22 found:

| Check | Evidence | Result |
|---|---|---|
| API deployment | Railway deployment `0e3e25ef-f8ef-411b-8edc-f098e2b61814`, branch commit `d5c5b2a` (code merged as `f71cff8`) | `SUCCESS`, one running replica |
| Dependencies | `GET https://api.metahunt.app/healthz` | `200`; Postgres, storage, Temporal all `ok` |
| HTTP smoke window | Railway metrics, previous 15m | 13 requests, 0% 5xx, p50 15 ms, p95 160 ms |
| Web production | Vercel deployment of `f71cff8` | `/radar/backend`, `/privacy`, robots, and sitemap return `200` with expected content |
| Schema | production constraints after migration `0028` | user → subscription and subscription → notification FKs both use `ON DELETE CASCADE` |
| Indexed supply | `/market/aggregates` | 12,665 total: 7,542 Djinni + 5,123 DOU |
| Backend cohort | role + preset skills + 30-day feed query | 179 jobs in the landing's alert window |
| Demo inventory | `/cv/samples` | five seeded profiles |
| Demo privacy boundary | sample-only match endpoint | seeded sample `200`; real uploaded/non-sample candidate `404`; legacy route `401` |
| Anonymous handoff | production `POST /subscriptions` using the Backend preset | created a UUID and matching HTTPS `t.me` start link; pending smoke row expires through normal cleanup |

Railway logs contain Temporal/Webpack informational startup output labelled at
`error` level even though the workflow bundle compiled and the worker entered
`RUNNING`. This is observability noise rather than an observed outage, but it
will make error-based alerting unreliable until normalized.

PR `#93`, Vercel web, Railway API, and migration `0028` are now deployed. One
anonymous pending subscription was created through the public API to verify the
handoff contract. No Telegram user message, secret change, cohort invitation,
or advertising action was performed.

## 4. UX and product audit

Evidence came from code paths, production HTTP checks, route builds, and local
HTML checks. No browser automation runtime was available, so mobile layout,
keyboard traversal, Core Web Vitals, and screenshot evidence remain unverified.

### Findings addressed

- Production advertised five demo profiles but sample matching required auth.
  The new sample-only endpoint restores proof-before-auth without widening the
  CV privacy boundary.
- `/` is a capable product screen, not a focused paid landing. New
  `/radar/backend` has one offer, one primary activation CTA, live 30-day proof,
  explicit DOU + Djinni scope, notification schedule, and stop controls.
- Root metadata described a “Neo-brutalist UI kit”; robots, sitemap, and privacy
  routes returned `404`. The branch replaces the description and adds all three
  public surfaces while marking account/operator route groups `noindex`.
- CV upload had no nearby third-party-processing disclosure. The upload control
  now links directly to the CV section of `/privacy`.

### Remaining UX risks

- The file picker opens before the logged-out user is told that Telegram login
  is required; login is checked only after file selection.
- `/welcome` collects email into the database but has no email delivery,
  founder workflow, export surface, or attribution event. It is a lead dead-end
  and should not receive launch traffic.
- A newly linked Telegram subscription now reuses the existing preview matcher
  to show up to three current matches, or a truthful zero-match state, directly
  after the activation confirmation. This remains unverified in production.
- Account, CV, and subscription deletion are self-service on the branch. The
  account path also removes same-Telegram-chat cold alerts and invalidates the
  old JWT at the next protected request.

## 5. Telegram, matching, and failure states

The delivery loop has stronger safety properties than the acquisition surface:

- pending subscriptions activate only through their opaque deep-link UUID;
- equivalent subscription links are serialized and deduplicated;
- repeated `/start` is idempotent;
- CV subscriptions require the authenticated owner's Telegram identity;
- a blocked/failing chat cannot starve other digest recipients;
- already-sent vacancy IDs prevent repeat delivery;
- `/list`, unsubscribe buttons, and `/stop` provide user controls;
- digests are evaluated hourly from 09:30 through 21:30 Europe/Kyiv and sent
  only when new matches exist.

Still unproven in production evidence:

- five consecutive landing → link → alert → click paths;
- zero-match evaluation rate and time to first eligible vacancy;
- Telegram blocked/rate-limit delivery rate;
- relevance of the first three alerts for the intended ICP;
- whether `/stop` and account controls are understandable without support.

## 6. Analytics and the measurable funnel

### Stable events already on `main`

Client: `subscribe_clicked`, `lens_switch`, `cv_upload`, `logged_in`,
`vacancy_feedback`, `bait_click`.

Server: `subscription_created`, `telegram_linked`, `digest_sent`,
`digest_link_clicked`, `apply_clicked`, `unsubscribed`.

### Added on this branch

`landing_view`, `landing_cta_clicked`, `subscription_create_started`,
`subscription_handoff_opened`, `subscription_create_failed`,
`cv_upload_started`, `cv_upload_completed`, `cv_upload_failed`,
`telegram_login_started`, `telegram_login_cancelled`, and
`telegram_login_failed`. The server also adds `activation_value_shown` after a
fresh Telegram link successfully renders its immediate sample or zero state,
plus `digest_evaluated` and `digest_delivery_failed` around scheduled delivery.
`digest_sent` now carries `is_first_digest` and `profile_type` as well.

Historical names were not renamed. New events fill missing intent and failure
steps while preserving existing dashboards. Campaign properties are bounded to
safe 64-character identifiers; email-like, free-form, and oversized values are
dropped. CV text, filename, candidate UUID, raw Telegram identity, and full
filter payloads are excluded.

### PostHog funnels to verify before launch

Immediate activation:

```text
landing_view
→ landing_cta_clicked
→ subscription_create_started
→ subscription_created
→ subscription_handoff_opened
→ telegram_linked
→ activation_value_shown
→ digest_link_clicked
```

The immediate sample's vacancy links retain the historical attributed-click
event name. Measure scheduled retention separately so a preview click is not
mistaken for a delivered digest:

```text
telegram_linked
→ digest_evaluated
→ digest_sent
→ digest_link_clicked
```

Required breakdowns: `utm_source`, `utm_medium`, `utm_campaign`, `creative_id`,
`landing_variant`, and `profile_type`. Use opaque subscription identity after
creation. Do not add direct user identifiers.

The privacy-safe server contract now exposes scheduled zero-match outcomes,
bounded delivery failures, and first-digest status. What remains is controlled
Telegram production verification and creation of the saved PostHog views in the
[`first-user-funnel` runbook](md/runbook/first-user-funnel.md), including a
named owner and dashboard URL.

## 7. Prioritized work

| ID | Priority | Problem and hypothesis | Scope / acceptance | Measurement | Rollback |
|---|---|---|---|---|---|
| G0 Review and deploy branch ✅ | Done | PR `#93`, web, API, and migration `0028` are in production. | Sample-only endpoint returns `200` for a seeded sample and `404` for an uploaded/non-sample candidate; public launch surfaces return `200`. | Production HTTP and provider deployment evidence above. | Revert feature code if needed; the forward-compatible cascade constraint may remain. |
| G1 Controlled activation E2E | P0 · S | Repository tests do not prove cross-domain Telegram delivery. | Run five owner-approved test subscriptions; record event timestamps and results through first click; repeat `/start`; test `/stop`. | 5/5 linked, 5/5 value shown, no duplicates or PII. | Disable test subscriptions with `/stop`. |
| G2 Funnel dashboard | P0 · S | The event contract exists, but traffic cannot be diagnosed without production access and one shared view. | Create the saved views specified in the first-user-funnel runbook; record their URL, owner, timezone, and controlled-test exclusion. | Daily activation, handoff loss, time to first digest, click rate, zero-match and delivery-failure rates. | Remove dashboard only; event contract stays stable. |
| G3 Verify immediate post-link value | P0 · S | Branch implementation must be proven across the real bot/API boundary. | A fresh `/start` shows up to three current matches or an explicit zero-match state; a preview failure never reverses the successful activation. | `telegram_linked → activation_value_shown ≥ 80%`. | Revert the additive Telegram commit; scheduled delivery remains unchanged. |
| G4 Approve privacy/auth launch policy | P0 · S | Technical deletion, stale-token invalidation, login throttling, public disclosure, and a retention runbook are deployed; provider backups, consent, and legal ownership are policy decisions. | Owner approves or edits wording, analytics consent posture, provider retention expectations, and support owner. | Real delete E2E passes; no PII leak; support owner can follow the runbook. | Disable CV campaign; role radar remains available. |
| G5 Concierge cohort | P0 · 7 days | Offline ranking confidence is not user value. | Use the [first-user-cohort runbook](md/runbook/first-user-cohort.md) to recruit 20 consenting ICP users, interview at least five, and rate their first three alerts. | Thresholds below. | Stop recruitment; no paid spend. |
| G6 Paid experiment | P1 · 7 days | Scale only after activation and quality are understood. | One audience, one landing, one channel, 200 qualified sessions maximum. | Thresholds below. | Pause campaign immediately. |

Not now: new matching algorithm, B2B/recruiter workflow, pricing, broad content
platform, large redesign, or more sources. Each adds variables before the core
activation loop is measured.

## 8. Strategy options

### Recommended: candidate-first job radar

- ICP: Ukrainian Middle/Senior Backend and Full-stack engineers who already
  check DOU, Djinni, and Telegram.
- Promise: new relevant jobs without repeated manual checking.
- Activation: `telegram_linked`; stronger activation: first useful digest click.
- Existing assets: 179 Backend jobs in the current preset's 30-day query, filters,
  deduplication, cold subscriptions, digests, and attributed clicks.
- Primary risk: alert relevance and delayed first value.

### Search-first aggregator

- ICP: broader Ukrainian tech job seekers.
- Activation: useful filter result or original-job click.
- Benefit: public value before any identity or third-party processing.
- Risk: competes directly with established boards and has weaker retention.
- Small experiment: ask 20 users whether dedup/structured filters replace one
  of their current search habits; stop if repeat weekly use is below 20%.

### Market intelligence/content

- ICP: job seekers and hiring-market observers.
- Activation: role/skill market page read or newsletter/alert signup.
- Benefit: indexable inventory and proprietary structured data.
- Risk: content and SEO are a second product loop; freshness and methodology
  must be defensible.
- Defer until the radar cohort proves supply quality.

### B2B/recruiter

Not now. It requires a different buyer, workflow, compliance posture, and sales
motion. Candidate behaviour should not be treated as evidence for it.

## 9. Small traffic experiment

### Gate 0: controlled E2E

- 5/5 subscriptions reach `telegram_linked`;
- 5/5 show immediate preview/value or a truthful zero-match state;
- repeated `/start` creates no duplicate;
- `/stop` prevents later delivery;
- one PostHog funnel joins browser and server events;
- no direct identity or CV content reaches analytics.

### Gate 1: 20 founder-recruited users

Success:

- at least 8/20 link Telegram;
- at least 6/8 see one relevant vacancy within 24 hours;
- at least 3/8 click a Telegram vacancy within seven days;
- at least five users complete a short interview;
- at least 60% rate two of their first three vacancies as relevant;
- unsubscribe is at most 20%.

### Gate 2: paid or sponsored traffic

Run one channel, one ICP, one landing, and at most 200 qualified unique sessions.

- Scale: landing → linked subscription at least 10%, created → linked at least
  60%, linked → activation value at least 80%, and at least 30% of linked users
  click a digest within seven days.
- Iterate: 5–10% activation with acceptable relevance.
- Stop: activation below 5% after 200 sessions, more than 30% irrelevant first
  alerts, any P0/support incident, or zero digest clicks among the first ten
  activated users.

Suggested creative:

> Still checking DOU and Djinni manually? MetaHunt collects new Backend jobs,
> removes repeat listings, and sends matching ones to Telegram.

Rollout order: personal invitations → one permissioned community post → one
role-specific sponsored placement → only then a small paid campaign.

## 10. Unknowns and morning decisions

The owner must decide:

1. Confirm Backend Middle/Senior as the first 30-day ICP, or choose Full-stack.
2. Confirm the cold Telegram radar as the primary offer and CV matching as the
   post-activation upsell.
3. Name the first channel, no-regret budget, and maximum 200-session test window.
4. Approve public DOU + Djinni and daytime-schedule wording.
5. Approve or edit the DeepSeek/privacy wording and choose analytics consent,
   provider-log/backups retention, and legal-controller posture.
6. Name the person watching delivery failures and user support for the first 48
   hours.
7. Confirm access to the production PostHog project and create the funnel/query.
8. Provide five safe Telegram testers or an approved test-bot path.

Deployment is complete. Advertising remains a separate explicit action after
Gate 1.

Unknown from available evidence: real users to date, historical PostHog counts,
first-alert quality, source licensing/permission posture, legal controller
identity, analytics consent requirements, and production retention expectations.

## 11. Evidence index

- Product history: [`md/journal/releases.md`](md/journal/releases.md)
- Current roadmap: [`md/roadmap.md`](md/roadmap.md)
- System snapshot: [`md/architecture/overview.md`](md/architecture/overview.md)
- Funnel tracker: [`md/journal/migrations/real-user-funnel.md`](md/journal/migrations/real-user-funnel.md)
- CV privacy contract: [`md/runbook/cv-privacy.md`](md/runbook/cv-privacy.md)
- Account deletion runbook: [`md/runbook/account-deletion.md`](md/runbook/account-deletion.md)
- First-user measurement runbook: [`md/runbook/first-user-funnel.md`](md/runbook/first-user-funnel.md)
- First-user cohort runbook: [`md/runbook/first-user-cohort.md`](md/runbook/first-user-cohort.md)
- Client analytics seam: [`apps/web/lib/hooks/use-analytics.ts`](apps/web/lib/hooks/use-analytics.ts)
- Server analytics seam: [`apps/etl/src/platform/analytics/analytics.service.ts`](apps/etl/src/platform/analytics/analytics.service.ts)
- Sample security tests: [`apps/etl/src/03-discovery/cv/cv.controller.sample.spec.ts`](apps/etl/src/03-discovery/cv/cv.controller.sample.spec.ts)
- Campaign landing: [`apps/web/app/radar/backend/page.tsx`](apps/web/app/radar/backend/page.tsx)
- Public disclosure: [`apps/web/app/privacy/page.tsx`](apps/web/app/privacy/page.tsx)
- Delivery: PR [`#93`](https://github.com/m4xx1k/metahunt_solo/pull/93), main
  commit `f71cff8`, Railway deployment `0e3e25ef-f8ef-411b-8edc-f098e2b61814`.

Verification completed on the branch: ETL focused security/controller tests,
the full ETL and web Jest suites, ETL lint, web lint, ETL production build, web
production build, local route checks, GitHub CI, Vercel production deployment,
Railway health/dependency/runtime checks, migration constraint inspection, and
production HTTP contract checks. Real Telegram activation and PostHog person
joining still require the controlled tester cohort.
