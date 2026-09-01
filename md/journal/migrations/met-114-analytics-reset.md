# met-114-analytics-reset — PostHog-first analytics

**Branch:** `feat/met-114-analytics-reset`
**Status:** in-progress
**Started:** 2026-07-31

## Outcome

_In progress. This tracker replaces the old ledger-first implementation with a
PostHog-first behavioural model while retaining only CRM and delivery facts in
Postgres until the parity gate is met._

## Subtasks

- [ ] T0 — Canonical person identity — _blocked by audit:_ browser, Telegram, and account activity use one opaque PostHog person id; account merge is authenticated and transactional. Migration `0037` backfills journey/subscription rows but does not consolidate repeated Telegram-only `chat_id` records, so full parity is not proven.
- [x] T1 — Event taxonomy — _done when:_ new events use `entity_action`, page views have `page_type`, and old PostHog views remain queryable during the transition.
- [ ] T2 — Founder PostHog workspace — superseded: `pnpm posthog:founder`, `scripts/posthog-founder-setup.ts`, and `md/runbook/founder-posthog.md` are removed (2026-09-01) — that dashboard is dead, replaced by PostHog project 239290. Re-open with a fresh subtask if a founder workspace is rebuilt against the current project.
- [ ] T3 — Compact CRM dashboard — _blocked by identity audit:_ people, not duplicated ledger journeys, are paginated/searchable server-side with the four agreed operator metrics.
- [x] T4 — Ledger narrowing gate — _done when:_ the inventory, parity queries, and rollback condition are documented before any event table is removed.
- [x] T5 — Verification and cleanup — _done when:_ unit/integration/build checks pass and nonessential comments are removed.

## Decisions

- `users.id` is the opaque canonical person identifier once a person is known.
  Browser activity starts on a random journey id and is aliased to that id only
  after a verified account or Telegram link.
- Postgres retains account, subscription, and delivery state. It is not the
  source for acquisition, path, funnel, or retention reporting after parity.
- A conflicting Google identity is never auto-merged: the current Google token
  flow has a documented replay gap. The merge flow requires two independent
  authenticated sessions plus a hash-only, 10-minute, single-use confirmation
  code; admin/provider/CV conflicts fail safely.

## Links

- Linear: [MET-114](https://linear.app/metahunt/issue/MET-114/analytics-reset)
- Children: MET-115, MET-116, MET-117, MET-118, MET-119
