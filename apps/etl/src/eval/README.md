# Vacancy Requirements v2 evaluation

25 real vacancy texts with hand-written labels, scored by a deterministic scorer.
No service, no hosted dataset, no build step.

```bash
pnpm eval                      # 25 rows against ExtractVacancyRequirementsV2
pnpm eval --only <row-id>      # one row
pnpm eval --concurrency 8      # default 4
pnpm eval --refresh-aliases    # rebuild aliases.snapshot.json — needs DATABASE_URL
```

Needs `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` in `.env`. It calls the provider, so
it is deliberately manual.

## What is where

- `vacancy-requirements-v2.dataset.json` — the golden set: `input`,
  `expectedOutput`, `metadata`. `vacancy-requirements-v2.review.md` is its
  readable GitHub view.
- `aliases.snapshot.json` — frozen SKILL alias → canonical map, resolved through
  production `normalizeAliasName`. The scorer reads it instead of the database, so
  a moving taxonomy cannot silently change scores between runs; its sha is
  recorded in every run.
- `extraction.scorer.ts` — precision / recall / F1 over canonicalized clauses,
  priority and alternative accuracy, `or_split_errors`, and the isTech / role /
  seniority guards. Unknown names keep a stable `unresolved:` key.
- `run-eval.ts` — the runner. `dataset.ts` — loading, validation, release gate.
- `runs/<date>-<client>.{json,md,html}` — per-row scores, the aggregate table, and
  a side-by-side HTML view (vacancy text left, missing/extra clauses and the full
  extracted object right, worst rows first). Committed: they are the evidence
  behind a model or prompt decision.

## Two extractors

`--extractor requirements-v2` (default) is `ExtractVacancyRequirementsV2`, the
contract the labels were written against. `--extractor production` is
`ExtractVacancy` and needs `DATABASE_URL` for its taxonomy prompt; its `anyOf`
metrics stay at zero until `requirement-groups.md` Pass 2 adds `alternatives` to
the production contract.

## Release gate

All 25 rows are `draft`, so `assertReleaseGate` does not run and a draft-only run
never claims one — the aggregate is for comparison only. When rows are approved,
only those rows feed both the summary and the gate. `requirement-groups.md` R7
approves the 10 rows carrying a MUST group before Pass 2 ships.

`seniority` is excluded from model comparisons: `advertisedSeniority()` is a regex
over the title, so it is identical for any two models.
