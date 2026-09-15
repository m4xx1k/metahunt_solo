# test-slop-cleanup — kill low-value tests, add a guard that keeps them out

**Branch:** `chore/test-slop-cleanup` (seeded from `feat/taxonomy-kind-rail`)
**Status:** in-progress
**Started:** 2026-09-07 · **Closed:** —
**Linear:** [MET-157](https://linear.app/metahunt/issue/MET-157/test-slop-cleanup-quality-guard) (Platform)

## Why

A pass over all ~120 spec files (ETL unit + int, web) found the suite is
**mostly solid** — int specs, `*.contract`/`*.derive`, web/seo, `format`,
`skill-diff` all set a real behavioral frame. But a visible ~10–15% is
net-negative: it gives false confidence, breaks on any refactor, and tests the
*shape of the implementation* instead of what the code does. Two guard specs
were the worst and are already deleted; the rest is the "fake the Drizzle query
builder, assert it was called" pattern.

### The volume question — settled

"15k lines of tests is too much" is **not** the problem. Ratios:

| | source LOC | test LOC | test : source |
|---|---|---|---|
| ETL | 24 938 | 14 120 (8.5k unit + 5.6k int) | **0.57 : 1** |
| web | 24 452 | 1 697 | **0.07 : 1** |
| app total | ~49k | ~15.8k | **~0.32 : 1** |

Healthy is 0.5–1.5 : 1. ETL is on the low side of healthy; **web is barely
tested**. There is no LOC cap and there will not be one — a cap punishes the
verbose-but-valuable int specs (fixtures cost lines) and rewards cheap
`toHaveBeenCalled` specs. **The constraint is a quality gate, not a quantity
one.** If a module's ratio climbs past ~1.5:1, that's a prompt to look, not a
CI failure.

## Policy — what a test must earn its place by

1. **Assert an observable result** — a return value, a thrown error, a row in
   the DB, a rendered string. Not "it didn't throw", not "toBeDefined".
2. **Don't assert the implementation shape** — no "called `repo.x` with these
   exact args" as the *only* assertion (arg-matching a real seam like a
   repository is fine); no regex over source files; no snapshot of an imported
   constant.
3. **Would it fail if the behavior broke?** If you can invert the logic under
   test and the test stays green, it's not a test.
4. **Mock at the seam, not the SDK** — see `TESTING.md#mocking`. Drizzle chains
   are not a seam; use an int test or a repository interface.
5. **No test for**: framework glue, trivial getters, a 2-line utility that is
   its own spec (fold it into a sibling or drop it).

## Antipatterns the guard flags

`scripts/test-slop-check.mjs` — runs on every `*.spec.ts` Write/Edit (Claude
Code `PostToolUse` hook, config in the gitignored `.claude/settings.json`) and
in `lint-staged` pre-commit. `[BAD]` → exit 2 (nudge / block on commit);
`[REVIEW]` → exit 0 (surface only).

| Tag | Pattern | Fix |
|---|---|---|
| BAD | reads source files (`readFileSync`/`readdirSync`) and matches their text | delete; assert the behavior, or move the invariant to an ESLint rule |
| BAD | `it()` with no `expect()`/`assert` | assert something, or delete |
| BAD | ≥4 chained `jest.fn().mockReturnValue()` around a Drizzle context | int test (Testcontainers) or a repository seam |
| REVIEW | every assertion in a test is bare `toHaveBeenCalled()` / `toHaveBeenCalledTimes()` | assert the outcome; OK only for a "must NOT call X" guard |
| REVIEW | every assertion is `toBeDefined` / `toBeTruthy` / `toBeGreaterThan(0)` | assert the actual value/shape |

## Mechanism — the three sieves

- **Sieve 1 — deterministic lint, at write time.** `test-slop-check.mjs` via the
  `PostToolUse` hook (done) + `lint-staged` (done). Next: replace the hand-rolled
  script rules with `eslint-plugin-jest` (`expect-expect`, `no-standalone-expect`,
  `valid-expect`, `no-conditional-expect`) + two local rules:
  `no-source-scan-tests`, `no-untagged-posting-read` (this is where the deleted
  `posting-grain-guard` invariant lands — `overview.md` already points here).
- **Sieve 2 — semantic review, pre-commit.** A human/agent read of each changed
  spec against the Policy above. Not automated; it's a checklist, not a job.
- **Sieve 3 — mutation testing, weekly.** Stryker on `03-discovery/ranking`,
  `03-discovery/score`, `02-enrich/dedup` only. Separate scheduled CI job, not
  per-PR. Gives a real "do these tests catch anything" number for the core.
- **CI:** add a `test-slop` step to `ci.yml` that runs the hook script over all
  specs — catches anything that reached `main` with `--no-verify`.

## Subtasks

- [x] T0 — delete `kind-isolation.guard.spec.ts` + `posting-grain-guard.spec.ts`
- [x] T1 — `scripts/test-slop-check.mjs` + `PostToolUse` hook + `lint-staged` wiring
- [x] T2 — fix the `TESTING.md` Drizzle-mock contradiction; repoint `overview.md`
- [ ] T3 — replace `kind-isolation` with a behavioral int test: *"a rare TECH
      skill does not outrank a common CONCEPT skill by type"* in
      `ranking.int.spec.ts` — *done when:* the D5 invariant has a test that fails
      if `kind` enters the ranking SQL
- [ ] T4 — port the posting-grain invariant to an ESLint rule
      `no-untagged-posting-read` — *done when:* a new raw `vacancies` read with no
      `POSTING-GRAIN-EXEMPT` comment fails `pnpm --filter @metahunt/etl lint`
- [ ] T5 — the 9 `[BAD]` Drizzle-chain specs: for each, int test or repository
      seam, then delete the chain mock — *done when:* `test-slop-check.mjs` over
      the suite reports 0 `[BAD]`
- [ ] T6 — the ~14 `[REVIEW]` specs: strengthen or accept-and-annotate
- [ ] T7 — swap the script's rules for `eslint-plugin-jest` + 2 local rules
- [ ] T8 — `test-slop` CI step in `ci.yml`
- [ ] T9 — Stryker weekly job on ranking/score/dedup
- [ ] T10 — web coverage: it's at 0.07:1. Decide deliberately what stays
      untested (Next.js glue, RSC) and where the gap actually hurts.

### T5 — the `[BAD]` list (Drizzle query-builder mocks)

```
apps/etl/src/02-enrich/loader/services/loader-backfill.service.spec.ts   (18 chained mocks)
apps/etl/src/admin/taxonomy/taxonomy.service.spec.ts                     (16)
apps/etl/src/01-ingest/rss/activities/rss-fetch.activity.spec.ts         (9)
apps/etl/src/admin/monitoring/monitoring.service.spec.ts                 (8)
apps/etl/src/01-ingest/rss/activities/rss-extract.activity.spec.ts       (6)
apps/etl/src/01-ingest/rss/rss-backfill.service.spec.ts                  (6)
apps/etl/src/01-ingest/rss/rss-ingest.service.spec.ts                    (5)
apps/etl/src/01-ingest/rss/activities/rss-parse.activity.spec.ts         (5)
apps/etl/src/01-ingest/rss/activities/rss-list-sources.activity.spec.ts  (4)
```

Not all are equally bad — some also carry real behavioral assertions and only
need the chain mock swapped for an int fixture. Triage per file.

## Decisions

- **Guard is advisory-first.** `[BAD]` blocks a commit *that touches that spec*
  (`lint-staged` only sees staged files); it does not block unrelated work, and
  `--no-verify` is the escape hatch. It becomes a hard CI gate once T5 clears.
- **Architectural-fitness checks belong in ESLint, not jest.** They run on every
  file, in-editor, with no test runner — a better home than a source-scanning
  spec. That's why `posting-grain-guard` moves rather than just dies.

## Links

- Contract: [`md/engineering/TESTING.md`](../../engineering/TESTING.md)
- Guard: `scripts/test-slop-check.mjs` · hook config `.claude/settings.json` (local, gitignored)
- ADRs: [0015 position read model](../decisions/0015-position-read-model.md) (owns the posting-grain invariant)
- PR: —
