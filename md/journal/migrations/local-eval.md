# local-eval — run the extraction eval from disk, then pick a model

**Branch:** `chore/local-eval`
**Status:** planned, nothing built.
**Written:** 2026-09-19.
**Linear:** unfiled.
**Related:** [`requirement-groups.md`](./requirement-groups.md) — Pass 2's release
gate (R7) runs on the runner built here, over the same 25 rows.

---

## Why

The eval already exists and is good: `apps/etl/src/eval/` carries 25 hand-labelled
vacancies, a 226-line deterministic `extraction.scorer.ts` with unit tests,
`assertReleaseGate`, and alias resolution through production `normalizeAliasName`.
None of that needs a service. Langfuse supplies only three things — dataset
hosting (a duplicate of the repo JSON), the run loop (a `for`), and score storage
(a file). It is also why nobody runs the eval: two extra keys, a manual upload,
and a build of two packages before a single row is scored.

Two things come out of this: a runnable eval, and a model comparison —
`deepseek/deepseek-v4.1-flash` (prod `DEEPSEEK_MODEL` is on `deepseek-v4-flash`;
confirm which is current) against `meta/muse-spark-1.3-contributor` on OpenRouter.
Because labels exist, that comparison answers *which model is closer to the
truth*, not just *what changed* — cents over 25 rows.

## The finished shape

| Entity | Where | What it is |
|---|---|---|
| Golden set | `eval/dataset/vacancy-requirements-v2.dataset.json` | 25 rows of `input` / `expectedOutput` / `metadata`. Unchanged. |
| Alias snapshot | `eval/dataset/aliases.snapshot.json` | Frozen SKILL alias → canonical map plus its sha. The only thing that ever needed Postgres. |
| Scorer | `eval/scoring/scorer.ts` | Unchanged. Owns canonicalization, OR clauses, `orSplitErrors`. `release-gate.ts` beside it. |
| Loaders | `eval/dataset/{load,aliases}.ts` | Dataset parsing and the snapshot, rescued from the deleted Langfuse file. |
| Runner | `eval/runner.ts` + `eval/run-eval.ts` | The loop, and the `ts-node` CLI that wires flags to it. |
| Reports | `eval/report/{markdown,html}.ts` | The aggregate table and the side-by-side view. |
| Run artifacts | `eval/runs/<date>-<client>.{json,md,html}` | Per-row scores and clause diffs, markdown aggregate, side-by-side HTML. Committed — they are the evidence behind the model choice. |
| promptfoo glue | `eval/promptfoo/{provider,score}.ts` + `promptfooconfig.yaml` | Step 3 only. ~40 lines wrapping the extractor and the scorer. |

```bash
pnpm eval                             # 25 rows, no Docker, no Postgres, no build
pnpm eval --client OpenRouterMuse     # same rows, other model
pnpm eval --extractor production      # same rows, the 15-field production contract
pnpm eval --refresh-aliases           # the one command that touches the database
pnpm eval:ui                          # promptfoo view — two models side by side
```

**Two extractors, two jobs.** `--extractor` picks between them and both are needed.

`requirements-v2` (default) — `BamlRequirementsV2Extractor`, 4 fields, the contract
the labels were written for. This is where the model comparison and every OR metric
live. Production's `ExtractedVacancy.skills` has no `anyOf` and caps at 10 entries,
so run the model comparison there and `alternativeAccuracy` / `orSplitErrors` read
zero for contract reasons rather than model reasons.

`production` — `BamlVacancyExtractor`, 15 fields. This is the regression guard for
`requirement-groups.md`: Pass 1's cap raise and Pass 2's `alternatives` both edit
`extract-vacancy.baml`, and a prompt edit aimed at skills can move location or work
format as a side effect. Its OR metrics stay dead until Pass 2 lands, at which point
the two contracts converge and the split stops mattering.

## Reports

Two views, because comparing models and reading one vacancy are different jobs.

- **`promptfoo view`** — row × model grid, filterable by failure. Answers *where did
  the two models disagree*. Cramped for long input text, which is fine, that is not
  its question.
- **`runs/<date>-<client>.html`**, written by the runner — vacancy text on the left,
  expected vs actual on the right, disagreements highlighted. Answers *why is this
  row wrong*. `vacancy-requirements-v2.review.md` is the hand-made ancestor of this
  view; the HTML replaces it and is regenerated per run. HTML rather than markdown
  because two columns and a highlighted diff do not survive GitHub's renderer.

**What is dropped.** `identity()` — `specHash` / `taxonomyHash` / `bamlSourceHash`
exist for the production cache (`extraction_artifacts`) and leaked into the eval
only to fill Langfuse metadata. The eval extractor keeps `extract` and stops
implementing `VacancyExtractor`.

## Steps

### Step 1 — the runner, no new model

| # | Step | Gate |
|---|---|---|
| 1 | `dataset.ts`: move `parseDatasetCase` + `assertReleaseGate` off the Langfuse file, add `loadDataset` (disk) and `loadAliases` (snapshot, `--refresh-aliases` rebuilds it from `node_aliases`). | `extraction.experiment.spec.ts` compiles against the new path. |
| 2 | `run-eval.ts`: flags `--client`, `--extractor`, `--concurrency`, `--only <id>`, `--refresh-aliases`. Writes the run json, the markdown aggregate, and the side-by-side HTML. | `pnpm eval` scores 25 rows with Docker down. |
| 3 | Delete `extraction.experiment.ts`; drop `@langfuse/client`, `@langfuse/otel`, `@opentelemetry/sdk-node`; `eval:requirements-v2` becomes `eval`, on `ts-node`, no build step. Rewrite `eval/README.md`. | `pnpm test:etl` green; scorer untouched. |

The alias snapshot is not a convenience. Taxonomy moves, the alias map feeds the
scorer, so two runs on different days currently disagree for reasons that have
nothing to do with the model. The snapshot's sha goes in the run file.

### Step 2 — cheap labels for the rest of the production contract

`expectedOutput` covers 4 of production's 15 fields. Extend it with the ones that
compare by equality — `workFormat`, `employmentType`, `englishLevel`,
`engagementType`, `hasTestAssignment`, `hasReservation`, `companyName` — in one
labelling pass over the 25 rows. They are visible in the opening lines of a
posting, and the scorer gains one equality comparator, not seven.

Deferred, because each needs its own comparator rather than equality:
`locations` (city/country arrays with exonyms — the same normalization problem as
skills), `salary` (ranges, currency, net vs gross), `experienceYears` (float, "3+"
vs 3), `domain` (a separate taxonomy).

**This step is a precondition for `requirement-groups.md` Pass 1**, not for Pass 2.
The cap raise edits `extract-vacancy.baml`; without these labels, a side effect on
work format or English level is invisible.

### Step 3 — promptfoo and the second model

| # | Step | Gate |
|---|---|---|
| 1 | `OpenRouterMuseClient` in `clients.baml` (`provider openai-generic`, `base_url "https://openrouter.ai/api/v1"`, `api_key env.OPENROUTER_MUSE_API_KEY`); `pnpm baml:generate`. | `pnpm baml:identity:check` — the new client must not move the production identity hash. |
| 2 | `BamlRequirementsV2Extractor({ clientName, modelLabel })`: feeds BAML's `ClientRegistry` in `extract`, and `modelLabel` into `readUsage`. | One row through each client; `usage.client` differs. |
| 3 | `promptfooconfig.yaml` + provider and score wrappers. promptfoo owns the loop, storage and UI; the scorer stays the scorer. | Muse returns schema-valid output, or stop here and stay on DeepSeek. |
| 4 | Two runs, `promptfoo eval --no-cache`. | Compare, decide, record in `runs/`. |

**Compared:** F1, precision, recall, `alternativeAccuracy`, `priorityAccuracy`,
`orSplitErrors`, `isTech` accuracy, `schemaValidRate`, tokens and cost, p50 latency.

**Not compared:** `seniority` — `advertisedSeniority()` is a regex over the first
500 characters, identical for any two models, and a tie there would be an
artefact. `role` carries the `Software Engineer` fallback; read it with that in mind.

## The traps

**Caching, twice.** `readUsage` currently hardcodes `model: process.env.DEEPSEEK_MODEL`,
so it cannot witness a client swap — step 3.2 fixes that, and until it does, only
`usage.client` is trustworthy. Production's `specHash` *does* include the model, so
swapping `DEEPSEEK_MODEL` invalidates the cache correctly; a `ClientRegistry` swap
does not, which is why the eval never goes near `CachedVacancyExtractor`. promptfoo
keeps its own cache on top: `--no-cache`, always.

**A single run is noisy.** Measured on the first two runs: F1 67.0% then 63.8%,
`or_split_errors` 2 then 1, same extractor, same rows, same snapshot. The scorer is
deterministic, so that spread is the model. Step 3 must repeat each model's run
before reading a gap of a few points as a result.

**The gate does not apply yet.** All 25 rows are `draft`, so `assertReleaseGate`
will not pass and must not be asked to — for a model choice the aggregate over the
same rows is the comparison. It starts biting in `requirement-groups.md` Pass 2,
when the 10 rows carrying a MUST group are approved per R7.

## Scope

Extraction quality only. The Fit shift that `requirement-groups.md` Pass 1 and
Pass 2 cause is invisible to this runner and is measured separately (§8 there).
