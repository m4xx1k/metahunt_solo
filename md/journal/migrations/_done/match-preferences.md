# match-preferences — subscription-scoped `/match` criteria

**Branch:** `feat/match-preferences`
**Status:** done
**Started:** 2026-07-28 · **Closed:** 2026-07-30

## Outcome

CV facts remain reusable while roles, exclusions, and filters are scoped to a preview draft or one
subscription. Web preview and Telegram delivery share one matcher. Existing subscriptions remain
compatible, and real-Postgres tests protect ownership, exclusions, and subscription isolation.

## Subtasks

- [x] T0 — Map the existing CV, ranking, and `/match` contracts — _done when:_ persistence and query boundaries are explicit.
- [x] T1 — Model roles and excluded skills as match criteria — _done when:_ candidate facts do not contain search intent.
- [x] T2 — Use one matching path for preview and digest — _done when:_ both consumers resolve and apply the same criteria.
- [x] T3 — Replace `/match` mocks with a transient criteria draft — _done when:_ the preview uses real roles and exclusions without candidate-level persistence.
- [x] T4 — Persist criteria when a CV subscription is created — _done when:_ two subscriptions over one CV can produce independent matches.
- [x] T5 — Add behavior-level integration coverage — _done when:_ ownership, role filters, required-skill exclusions, and subscription isolation run against Postgres.
- [x] T6 — Verify and document the shipped surface — _done when:_ focused tests, typecheck/lint, review, and snapshot/release notes are complete.

## Decisions

- Candidate profiles contain CV facts; roles, excluded skills, and vacancy filters belong to a match draft or subscription.
- Role selections are a hard filter. A subscriber who rules out Mobile, QA, or DevOps should not need to hunt those vacancies at the bottom of a ranked list.
- Skill exclusions are a hard filter only when a vacancy marks the excluded skill as required. Optional mentions remain visible, so an otherwise-good role is not lost because it merely names an unwanted tool.

## Links

- Linear: [MET-103](https://linear.app/metahunt/issue/MET-103/rebuild-match-onboarding-cv-facts-editable-profile-exclusions-role), [MET-25](https://linear.app/metahunt/issue/MET-25/connect-steproles-to-real-api-replace-113-mocks)
- Account workspace: [MET-112](https://linear.app/metahunt/issue/MET-112/cv-match-account-workspace-and-editable-subscriptions)
- ADR: [ADR-0011](../../decisions/0011-subscription-scoped-match-criteria.md)
- Follow-up ranker: [MET-104](https://linear.app/metahunt/issue/MET-104/design-and-validate-a-v2-hybrid-cv-vacancy-ranker)
