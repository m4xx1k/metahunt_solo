# MetaHunt audit and next steps

**Audit date:** 2026-07-21

**Working branch:** `feat/real-user-funnel`

**Traffic verdict:** paid traffic **No-Go**; founder-led cohort **Conditional Go**
after review, deploy, and controlled E2E.

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
2. The pre-audit demo activation was broken: production lists five samples but
   anonymous sample matching returns `401`. Commit `13784db` fixes this through a
   sample-only endpoint, but production remains unchanged until owner-approved
   deployment.
3. Trust and operations need explicit ownership. Raw CV text is not persisted by
   MetaHunt, but it is sent to DeepSeek. Public disclosure now exists on the
   branch; retention, analytics consent, account deletion, and support ownership
   still require an owner decision.

Recommended next 7–14 days:

- review and deploy this branch;
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

Read-only production checks on 2026-07-21 found:

| Check | Evidence | Result |
|---|---|---|
| API deployment | Railway deployment `9b71a512-e26c-4fda-976b-eefe7ed3aafd`, commit `af1b19b` | `SUCCESS`, one running replica |
| Dependencies | `GET https://api.metahunt.app/healthz` | `200`; Postgres, storage, Temporal all `ok` |
| HTTP window | Railway metrics, previous 6h | 49 requests, 0% 5xx, p50/p95 47 ms |
| Web | `https://metahunt.app` → `https://www.metahunt.app/` | `200` |
| Indexed supply | `/market/aggregates` | 12,665 total: 7,542 Djinni + 5,123 DOU |
| Backend cohort | role + preset skills + 30-day feed query | 179 jobs in the landing's alert window |
| Demo inventory | `/cv/samples` | five seeded profiles |
| Demo activation before deploy | anonymous `/cv/:sample/matches` | `401` — fixed on branch, not yet deployed |

Railway logs contain Temporal/Webpack informational startup output labelled at
`error` level even though the workflow bundle compiled and the worker entered
`RUNNING`. This is observability noise rather than an observed outage, but it
will make error-based alerting unreliable until normalized.

No production mutation, deployment, secret change, database query, Telegram
message, or advertising action was performed by this audit.

## 4. UX and product audit

Evidence came from code paths, production HTTP checks, route builds, and local
HTML checks. No browser automation runtime was available, so mobile layout,
keyboard traversal, Core Web Vitals, and screenshot evidence remain unverified.

### Findings addressed on this branch

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
- A newly linked Telegram subscription confirms activation but does not show
  immediate value. `/preview` exists; reusing it after `/start` could shorten
  time-to-value without changing matching.
- Account deletion is not self-service. CV and subscription deletion are.

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
`telegram_login_failed`.

Historical names were not renamed. New events fill missing intent and failure
steps while preserving existing dashboards. Campaign properties are bounded to
safe 64-character identifiers; email-like, free-form, and oversized values are
dropped. CV text, filename, candidate UUID, raw Telegram identity, and full
filter payloads are excluded.

### PostHog funnel to verify before launch

```text
landing_view
→ landing_cta_clicked
→ subscription_create_started
→ subscription_created
→ subscription_handoff_opened
→ telegram_linked
→ digest_sent
→ digest_link_clicked
```

Required breakdowns: `utm_source`, `utm_medium`, `utm_campaign`, `creative_id`,
`landing_variant`, and `profile_type`. Use opaque subscription identity after
creation. Do not add direct user identifiers.

Still needed on the server: a digest-evaluated event for zero-match visibility,
delivery failure, `is_first_digest`, and a deterministic activation-value event.
Those should be added only with a daily operational query/dashboard so they
drive decisions rather than event inventory.

## 7. Prioritized work

| ID | Priority | Problem and hypothesis | Scope / acceptance | Measurement | Rollback |
|---|---|---|---|---|---|
| G0 Review and deploy branch | P0 · S | Production demo is broken and launch surfaces are absent. | Review commits `13784db` and `1752b1a`; deploy web + API; sample-only endpoint returns 200 for seeded sample and 404 for uploaded/non-sample candidate. | Five sample sessions render matches without auth. | Revert the two commits; no migration exists. |
| G1 Controlled activation E2E | P0 · S | Repository tests do not prove cross-domain Telegram delivery. | Run five owner-approved test subscriptions; record event timestamps and results through first click; repeat `/start`; test `/stop`. | 5/5 linked, 5/5 value shown, no duplicates or PII. | Disable test subscriptions with `/stop`. |
| G2 Funnel dashboard | P0 · S | Traffic cannot be diagnosed without one shared view. | Save the event funnel above plus zero-match/send-failure daily queries; document timezone and filters. | Daily activation, handoff loss, time to first digest, click rate. | Remove dashboard only; event contract stays stable. |
| G3 Immediate post-link value | P0 · M | First value may be delayed until the next matching vacancy. | After a fresh `/start`, reuse the existing preview matcher to show 1–3 current matches or an explicit zero-match state. | `telegram_linked → activation_value_shown ≥ 80%`. | Feature flag or remove the extra reply. |
| G4 Privacy/auth launch review | P0 · M | Disclosure exists, but consent, retention, account deletion, 30-day localStorage JWT, and auth throttling need ownership. | Owner approves wording; choose analytics consent posture; add account deletion; tighten auth throttle; document retention. | No PII leak; deletion test passes; support script exists. | Disable CV campaign; role radar remains available. |
| G5 Concierge cohort | P0 · 7 days | Offline ranking confidence is not user value. | Recruit 20 ICP users, interview at least five, rate their first three alerts. | Thresholds below. | Stop recruitment; no paid spend. |
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
5. Approve or edit the DeepSeek/privacy wording and choose analytics consent
   posture, retention period, and account-deletion policy.
6. Name the person watching delivery failures and user support for the first 48
   hours.
7. Confirm access to the production PostHog project and create the funnel/query.
8. Provide five safe Telegram testers or an approved test-bot path.
9. Review and explicitly authorize deployment. Advertising remains a separate
   explicit action after Gate 1.

Unknown from available evidence: real users to date, historical PostHog counts,
first-alert quality, source licensing/permission posture, legal controller
identity, analytics consent requirements, and production retention expectations.

## 11. Evidence index

- Product history: [`md/journal/releases.md`](md/journal/releases.md)
- Current roadmap: [`md/roadmap.md`](md/roadmap.md)
- System snapshot: [`md/architecture/overview.md`](md/architecture/overview.md)
- Funnel tracker: [`md/journal/migrations/real-user-funnel.md`](md/journal/migrations/real-user-funnel.md)
- CV privacy contract: [`md/runbook/cv-privacy.md`](md/runbook/cv-privacy.md)
- Client analytics seam: [`apps/web/lib/hooks/use-analytics.ts`](apps/web/lib/hooks/use-analytics.ts)
- Server analytics seam: [`apps/etl/src/platform/analytics/analytics.service.ts`](apps/etl/src/platform/analytics/analytics.service.ts)
- Sample security tests: [`apps/etl/src/03-discovery/cv/cv.controller.sample.spec.ts`](apps/etl/src/03-discovery/cv/cv.controller.sample.spec.ts)
- Campaign landing: [`apps/web/app/radar/backend/page.tsx`](apps/web/app/radar/backend/page.tsx)
- Public disclosure: [`apps/web/app/privacy/page.tsx`](apps/web/app/privacy/page.tsx)
- Implementation commits: `13784db`, `1752b1a`

Verification completed on the branch: ETL focused security/controller tests,
full web Jest suite, ETL lint, web lint, ETL production build, web production
build, and local HTTP checks for `/radar/backend`, `/privacy`, `/robots.txt`,
and `/sitemap.xml`.
