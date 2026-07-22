# real-user-funnel — Measurable path to first users

**Branch:** `feat/real-user-funnel`
**Status:** in-progress
**Started:** 2026-07-21

## Outcome

The branch fixes the broken anonymous sample activation path and adds a focused,
measurable Backend-radar landing, truthful public privacy disclosure, and the
basic search discovery surface. Ranking, ingest, and notification behaviour are
unchanged. Deployment, controlled Telegram E2E, and traffic remain owner gates.

## Subtasks

- [x] T0 — Audit product history and production readiness — *done when:* recent releases,
  live health, public surfaces, and funnel events have evidence-backed findings.
- [x] T1 — Add a truthful acquisition landing — *done when:* `/radar/backend` explains the
  DOU + Djinni offer, exposes a no-CV subscription path, and tracks activation intent.
- [x] T2 — Close launch trust and discovery gaps — *done when:* public privacy controls,
  metadata, robots, sitemap, and footer navigation are available.
- [x] T3 — Define the launch experiment — *done when:* the audit names ICP, events,
  thresholds, go/no-go gates, rollout, and owner decisions still required.
- [x] T4 — Verify and commit — *done when:* web lint, tests, production build, and focused
  route checks pass and changes are split into reviewable commits.
- [x] T5 — Shorten time-to-value — *done when:* a fresh Telegram activation immediately
  renders existing matches or a truthful zero state without risking the link itself.
- [x] T6 — Close the technical deletion boundary — *done when:* users can permanently
  delete their account, associated alerts and history disappear transactionally, and the old
  JWT no longer authorizes requests.
- [x] T7 — Make scheduled delivery diagnosable — *done when:* a zero-match evaluation,
  first digest, successful send, and bounded delivery failure are distinguishable without PII.
- [x] T8 — Operationalize the first cohort — *done when:* owner fields, consent-safe outreach,
  a per-user activation/relevance ledger, interview prompts, and stop gates are ready before contact.

## Decisions

- Lead with the candidate-first job-radar strategy. The product already has a complete
  feed → CV match → Telegram digest → apply-click loop; acquisition and measurement are
  the constrained parts.
- Keep launch work additive. The campaign route is new; shared metadata and footer links
  change only where a new public route must be discoverable.
- Reuse the existing 14-day preview matcher after a fresh `/start`. Its cards carry the
  subscription ID for click attribution, while a preview failure leaves activation intact.
- Do not deploy or buy traffic from this branch. Production mutation and ad spend remain
  explicit owner decisions after review and a controlled end-to-end activation test.

## Links

- Master brief: [`metahunt-coding-agent-master-brief.md`](../../../../metahunt-coding-agent-master-brief.md)
- Release history: [`../releases.md`](../releases.md)
- Privacy boundary: [`../../runbook/cv-privacy.md`](../../runbook/cv-privacy.md)
- Audit and launch plan: [`../../../METAHUNT_AUDIT_AND_NEXT_STEPS.md`](../../../METAHUNT_AUDIT_AND_NEXT_STEPS.md)
- Cohort operations: [`../../runbook/first-user-cohort.md`](../../runbook/first-user-cohort.md)
- PR: pending
