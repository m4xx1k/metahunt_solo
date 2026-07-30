# account-workspace — editable CV-match subscriptions

**Branch:** `feat/account-workspace`
**Status:** in-progress
**Started:** 2026-07-30

## Outcome

_(fill in when closing)_

## Subtasks

- [ ] T0 — Add mutable subscription names — _done when:_ new and existing rows have a usable name and an owner-scoped rename contract.
- [ ] T1 — Expose editable criteria — _done when:_ account reads return typed public refs and updates normalize them into stored node ids.
- [ ] T2 — Protect ownership and compatibility — _done when:_ integration tests cover cross-account writes, legacy rows, and independent subscriptions over one CV.
- [ ] T3 — Rebuild `/me` as an account workspace — _done when:_ account, subscriptions, and CVs have clear responsive sections on the shared page background.
- [ ] T4 — Add subscription editing — _done when:_ a user can rename and edit one subscription without changing its CV or sibling subscriptions.
- [ ] T5 — Add rollout affordances — _done when:_ existing users see the upgrade path while unfinished distribution remains out of public navigation.
- [ ] T6 — Verify and document — _done when:_ lint, tests, builds, independent review, architecture, and release notes are complete.

## Decisions

- A CV owns extracted and user-confirmed facts. Editing it affects every match that references it.
- A subscription owns its mutable name, delivery state, roles, excluded skills, and vacancy filters.
- Editing subscription criteria replaces that subscription snapshot only; it never mutates the CV.
- Stored node ids stay private to persistence. Account edit contracts expose URL-facing slugs.
- Existing subscriptions keep matching as they do today until their owner explicitly saves an edit.

## Links

- Linear: [MET-112](https://linear.app/metahunt/issue/MET-112/cv-match-account-workspace-and-editable-subscriptions)
- ADR: [ADR-0011](../decisions/0011-subscription-scoped-match-criteria.md)
- Foundation PR: [#154](https://github.com/m4xx1k/metahunt_solo/pull/154)
