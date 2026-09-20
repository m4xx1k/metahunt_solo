# Vacancy Requirements v2 evaluation

29 real vacancy texts with hand-written labels, scored by a deterministic scorer.
No service, no hosted dataset, no build step.

```bash
pnpm eval                      # 29 rows against ExtractVacancyRequirementsV2
pnpm eval --only <row-id>      # one row
pnpm eval --concurrency 8      # default 4
pnpm eval --client OpenRouterMuseClient   # swap the model behind the same prompt
pnpm eval --refresh-aliases    # rebuild aliases.snapshot.json and exit — needs DATABASE_URL
```

An unknown `--extractor`, a non-positive `--concurrency`, or an `--only` that
matches nothing fails with the accepted values named.

Needs `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` in `.env`. It calls the provider, so
it is deliberately manual.

## What is where

```
run-eval.ts        CLI: flags, extractor choice, writing the run files
runner.ts          the loop — concurrency, per-row scoring, the aggregate
types.ts           shared vocabulary: contract, case, score, summary, run
dataset/           the golden set and the frozen alias map, with their loaders
scoring/           scorer.ts and release-gate.ts
extractors/        requirements-v2.ts
report/            markdown.ts and html.ts
runs/              generated run artifacts
```

- `dataset/vacancy-requirements-v2.dataset.json` — the golden set: `input`,
  `expectedOutput`, `metadata`. `vacancy-requirements-v2.review.md` beside it is
  its readable GitHub view.
- `dataset/aliases.snapshot.json` — frozen SKILL alias → canonical map, resolved
  through production `normalizeAliasName`. The scorer reads it instead of the
  database, so a moving taxonomy cannot silently change scores between runs; its
  sha is recorded in every run.
- `scoring/scorer.ts` — precision / recall / F1 over canonicalized clauses,
  priority and alternative accuracy, `or_split_errors`, and the isTech / role /
  seniority guards. Unknown names keep a stable `unresolved:` key.
- `runs/<date>-<client>.{json,md,html}` — per-row scores, the aggregate table, and
  a side-by-side HTML view (vacancy text left, missing/extra clauses and the full
  extracted object right, worst rows first). Committed: they are the evidence
  behind a model or prompt decision.

## Run-to-run variance

The scorer is deterministic; the model is not. Two consecutive runs of the same
extractor on the same rows gave F1 67.0% and 63.8%, with `or_split_errors` 2 and 1.
A single run therefore carries a few points of noise, and a comparison between two
models only means something when the gap is clearly wider than that. Repeat a run
before reading a small difference as a result.

## Clients

`extractors/clients.ts` declares the eval's LLM clients at runtime through BAML's
`ClientRegistry`, not in `baml_src/clients.baml`. `baml:identity:check` hashes that
file whole, so adding a challenger there would move `BAML_PRODUCTION_SOURCE_HASH`,
hence every artifact's `spec_hash`, and re-extract the entire corpus for a client
production never calls. Each entry also carries its own model name, because BAML's
collector reports the client but not the model.

`--client` only reaches `--extractor requirements-v2`. Production's `ExtractVacancy`
is bound to `DeepSeekClient` in `clients.baml`.

## Two extractors

`--extractor requirements-v2` (default) is `ExtractVacancyRequirementsV2`, the
contract the labels were written against. `--extractor production` is
`ExtractVacancy` and needs `DATABASE_URL` for its taxonomy prompt. Its flat
`skills` are adapted into the labels' shape by `adaptLegacySkills`: one
requirement per skill, except where `skills.alternatives` marks several of them
as one choice, which becomes one multi-entry requirement and removes the
members' singletons. A group naming a skill outside `required`, or collapsing to
fewer than two, is ignored — the same rules the loader drops it by.

## Release gate

All 29 rows are `draft`, so `assertReleaseGate` does not run and a draft-only run
never claims one — the aggregate is for comparison only. When rows are approved,
only those rows feed both the summary and the gate. `requirement-groups.md` R7
approves the 16 rows carrying a MUST group before Pass 2 ships.

`seniority` is excluded from model comparisons: `advertisedSeniority()` is a regex
over the title, so it is identical for any two models.
