# Code review

Small PRs, fast turnarounds, kind comments. The goal is shared quality, not gatekeeping.

## As an author

- Self-review the diff before requesting review.
- Keep PRs under ~500 lines of real change. Split if larger.
- Description says **what** changed and **why**. Link the tracker / ADR / issue.
- Confirm tests pass, lint passes, and you ran the feature locally.

## As a reviewer

- Respond within a business day. If you can't, say so.
- Read the description first, then the diff.
- Distinguish blocking from non-blocking. Don't gate a PR on style nits.
- Approve when ready — perfect is not the bar.

## Comment prefixes

- `[blocking]` — must fix before merge.
- `[suggestion]` — optional improvement, author decides.
- `[nit]` — minor preference, take or leave.
- `[question]` — clarification, not an objection.
- `[praise]` — call out clean solutions.

## What to look for, in order

1. **Correctness** — edge cases, error paths, the unhappy path.
2. **Security** — auth checks, input validation, secrets, SQL safety.
3. **Design** — boundaries, dependencies, where logic lives.
4. **Tests** — present, meaningful, isolated.
5. **Performance** — N+1, await-in-loop, unbounded growth.
6. **Readability** — names, flow, comments where the *why* is non-obvious.
7. **Style** — last; lint catches most of this.

## Anti-patterns

- Rubber-stamp approvals.
- Bike-shedding on style when lint already covers it.
- "While you're here, also do X, Y, Z" — open a follow-up issue instead.
- Personal phrasing — "this code does …" not "you always …".
- Silent change-request without explanation.

## Disagreement

1. Restate the concern in your own words to confirm you understood it.
2. Explain the rationale you had.
3. If still split: data wins arguments (benchmark, test, link). If neither side has data, author decides on judgment calls; reviewer escalates only on real risk (security, correctness).
