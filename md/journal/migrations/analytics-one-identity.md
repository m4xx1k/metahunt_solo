# analytics-one-identity — finish the analytics cutover on one identity

**Branch:** `refactor/analytics-one-identity`
**Status:** in-progress
**Started:** 2026-08-16 · **Closed:** —

Continues [`analytics-real-metahunt-cutover.md`](analytics-real-metahunt-cutover.md), which shipped
steps 0–2 and stopped. This tracker carries the phases from the 2026-08-15 teardown audit
(three read-only audits cross-checked against production).

## Outcome

*(fill in when closing)*

## Why this exists

The cutover left both halves running: the Postgres ledger writes at full volume, PostHog covers
~21% of digests, and two admin dashboards answer the same questions from different stores. Every
divergence traces to one rule — *"an unlinked subscription is not yet a person"* — plus a muted
browser layer. The person spine (`subscriptions.person_id`, populated 45/45) already exists and is
simply unused.

## Subtasks

- [ ] T0 — Phase 0, clear the PostHog room (no code) — *done when:* one dashboard, three tiles, all returning data; authorized URLs set; cutover annotated
- [ ] T1 — Phase 1, one identity: capture on `person_id`, alias on account link, `$set` profiles — *done when:* digest coverage reaches every active subscription and two clicks on one link land on one person
- [ ] T2 — Phase 2, unmute the browser: real pageviews, no stub, no allow-list, `$set_once` redaction — *done when:* an anonymous visit produces a pageview and login merges its history
- [ ] T3 — Phase 3, one registry, one writer, one client — *done when:* every event name has exactly one definition and at least one live emitter
- [ ] T4 — Phase 4, retire the ledger — **gated**: needs 7 consecutive days of PostHog reproducing the ledger's counts within 5%. Cannot start before that window closes.
- [ ] T5 — Phase 5, make silent breakage loud: no-digest alert, staff flag, reachability in the catalog check — *done when:* unplugging an emitter surfaces within a day

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

**Browser events kept vs dropped (Rule 4 applied).** Kept: outcomes an outsider watching URLs and
clicks cannot infer — upload results, feedback sentiment, login failures, match-flow completion.
Dropped: clicks autocapture already sees (`lens_switch`, `*_started`) and account lifecycle the
server owns (`signed_in`, `account_created`).

## Links

- Prior tracker: `md/journal/migrations/analytics-real-metahunt-cutover.md`
- Audit: Metahunt Analytics Teardown (artifact, 2026-08-15)
- PR: …
