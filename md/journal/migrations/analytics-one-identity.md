# analytics-one-identity — finish the analytics cutover on one identity

**Branch:** `refactor/analytics-one-identity`
**Status:** in-progress (phase 4 blocked on its seven-day gate)
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

**Phase 4 is deliberately not started.** Its condition is seven consecutive days of PostHog
reproducing the ledger's digest and click counts within 5%, and that window cannot begin until this
branch is deployed. The date in the old cutover doc (18 Aug) is not the condition.

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
- [ ] T4 — Phase 4, retire the ledger — **gated**: needs 7 consecutive days of PostHog reproducing the ledger's counts within 5%. Cannot start before that window closes.
- [x] T5 — Phase 5, make silent breakage loud: no-digest alert, staff flag, reachability in the catalog check — *done when:* unplugging an emitter surfaces within a day

## Verification status

The code gates are met in test; the two live gates need production traffic after deploy:

| Gate | Status |
|---|---|
| Phase 0 — one dashboard, three tiles, data | ✅ verified (digests + clicks return rows) |
| Phase 1 — full digest coverage, two taps one person | ⏳ needs a day of production traffic |
| Phase 2 — anonymous visit produces a pageview, login merges it | ✅ verified 2026-08-17: 8 pageviews, two distinct ids merged into one person, `signed_in` on the same person |
| Phase 3 — one definition and one live emitter per name | ✅ `pnpm analytics:catalog`, reachability check verified against a planted unreachable event |
| Phase 4 — seven days of agreement | ⏳ window opens 2026-08-17 (deployed); run the runbook daily |
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

**Browser events kept vs dropped (Rule 4 applied).** Kept: outcomes an outsider watching URLs and
clicks cannot infer — upload results, feedback sentiment, login failures, match-flow completion.
Dropped: clicks autocapture already sees (`lens_switch`, `*_started`) and account lifecycle the
server owns (`signed_in`, `account_created`).

## Links

- Runbook (daily check + the parity gate): `md/runbook/analytics-ledger-parity.md`
- Prior tracker: `md/journal/migrations/analytics-real-metahunt-cutover.md`
- Audit: Metahunt Analytics Teardown (artifact, 2026-08-15)
- PR: …
