# local-eval — run the extraction eval from disk, then pick a model

**Branch:** `chore/local-eval` — PR #215, awaiting merge.
**Status:** built and measured. Moves to `_done/` once #215 lands.
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

Two things come out of this: a runnable eval, and a model comparison. Production
runs `deepseek-v4-flash` (the `.1` variant this tracker first named does not exist
in `.env`), measured against `meta/muse-spark-1.3-contributor` on OpenRouter.
Because labels exist, that comparison answers *which model is closer to the
truth*, not just *what changed* — the whole session cost under $0.50.

## The finished shape

| Entity | Where | What it is |
|---|---|---|
| Golden set | `eval/dataset/vacancy-requirements-v2.dataset.json` | 25 rows of `input` / `expectedOutput` / `metadata`. Unchanged. |
| Alias snapshot | `eval/dataset/aliases.snapshot.json` | Frozen SKILL alias → canonical map plus its sha. The only thing that ever needed Postgres. |
| Scorer | `eval/scoring/scorer.ts` | Unchanged. Owns canonicalization, OR clauses, `orSplitErrors`. `release-gate.ts` beside it. |
| Loaders | `eval/dataset/{load,aliases}.ts` | Dataset parsing and the snapshot, rescued from the deleted Langfuse file. |
| Runner | `eval/runner.ts` + `eval/run-eval.ts` | The loop, and the `ts-node` CLI that wires flags to it. |
| Reports | `eval/report/{markdown,html}.ts` | The aggregate table and the side-by-side view. |
| Clients | `eval/extractors/clients.ts` | `DeepSeekClient`, `DeepSeekThinkingClient`, `OpenRouterMuseClient`, registered at runtime. |
| Editor | `eval/dataset/editor.ts` | `pnpm eval:dataset` — a local page for reading and relabelling the golden set. |
| Run artifacts | `eval/runs/<date>-<extractor>-<client>.{json,md,html}` | Per-row scores and clause diffs, markdown aggregate, side-by-side HTML. Committed — they are the evidence behind the model choice. |

```bash
pnpm eval                                  # 25 rows, 33s, no Docker, no build
pnpm eval --repeat 3                       # the model is not deterministic
pnpm eval --client OpenRouterMuseClient    # same rows, other model
pnpm eval --extractor production           # the 15-field production contract
pnpm eval --only <row-id> --concurrency 8
pnpm eval --refresh-aliases                # the one command that touches the database
pnpm eval:dataset                          # edit the golden set
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

- **`runs/<date>-<extractor>-<client>.html`**, written by every run — vacancy text
  on the left, missing and extra clauses and the full extracted object on the right,
  worst rows first. Answers *why is this row wrong*.
- **`pnpm eval:dataset`** — the same split, with the labels editable. Requirements
  edit as `must: React | Vue.js` lines; `profile` as `field: value` lines, where an
  omitted line means unreviewed. Saving writes the JSON back through the runner's
  own validation.

The vacancy text is rendered one sentence per line because the scraped text is a
single blob — every row carries two newlines in ~5k characters — so its paragraphs
cannot be recovered, only invented. Display only.

**What is dropped.** `identity()` — `specHash` / `taxonomyHash` / `bamlSourceHash`
exist for the production cache (`extraction_artifacts`) and leaked into the eval
only to fill Langfuse metadata. The eval extractor keeps `extract` and stops
implementing `VacancyExtractor`.

## What was built

| # | Step | Outcome |
|---|---|---|
| 1 | Local runner; `dataset/`, `scoring/`, `extractors/`, `report/`; Langfuse and its three dependencies dropped. | Done. `pnpm eval` scores 25 rows in 33s with Docker down. |
| 2 | `--repeat`, because one pass carries a few points of model noise. | Done. Reports the mean plus every pass and its provider failures. |
| 3 | `--client`, clients registered at runtime. | Done. Declaring the challenger in `clients.baml` fails `baml:identity:check` — see the traps. |
| 4 | Model comparison, three passes each. | Done. Stay on DeepSeek. |
| 5 | `value \| anyOf` collapsed to one shape. | Done, and it regressed first — see below. |
| 6 | `profile` labels for production's other fields. | Partial: 22 of 25 rows, 51 values. |
| 7 | promptfoo. | Deferred. The runner owns the loop, the storage and a side-by-side view; only the two-model grid is left to buy. |

## What it measured

| | requirements-v2 | production |
|---|---|---|
| F1 | 71.2% | 57.2% |
| recall | 72.3% | 49.9% |
| role accuracy | 93.3% | 52.0% |
| or_split_errors | 6.0 | 13 |
| profile fields | — | 96.1% of 51 |

Production's three weak numbers are mostly structural, not quality: its contract
has no `anyOf` at all (0 emitted against 22 in the labels), its cap of 10 + 5 is
below what 10 of the 25 rows need, and its role list is 100 VERIFIED nodes with
heavy overlap rather than the v2 list of 30. That is the "before" for
`requirement-groups.md`, and it is why `--extractor production` numbers must not
be read as extraction quality.

### Models, three passes each

| | F1 | or_split | per row | out tokens |
|---|---|---|---|---|
| DeepSeek | 68.4% | 2.7 | 1.6s | 8.9k |
| DeepSeek + thinking | 69.8% | **0.0** | 19.9s | 153k |
| Muse | **73.0%** | 5.7 | 45.2s | 109k |

**Stay on DeepSeek.** Muse's lead is real — the pass ranges do not overlap — but
it is twice as bad at the grouping this initiative is about, 29x slower, and a
corpus re-extraction becomes a day instead of an hour.

**Reasoning, not the model, is what stops OR clauses being split.** Same model,
2.7 → 0.0, for 5x the cost and one row that reproducibly fails to parse. That
belongs to `requirement-groups.md` Pass 2, not here.

### The one-form contract regressed before it helped

Collapsing `value | anyOf` removed the signal that a requirement is normally one
thing, and the model began merging unrelated items into a single choice. F1 hid
it, because a lump is a miss and an extra that cancel out.

| | groups | 3+ | max | F1 |
|---|---|---|---|---|
| two-form | 26 | 11 | 4 | 68.4% |
| one-form, first attempt | 41 | 18 | 6 | 67.5% |
| one-form + explicit default | **22** | 9 | 4 | **71.2%** |

The labels carry 22 choices. Stating the one-entry default in the prompt fixed
it and cleared the original baseline. The error then inverted: `or_split_errors`
2.7 → 6.0, the model splitting genuine choices instead of inventing them.

## The traps

**Caching, twice.** `readUsage` currently hardcodes `model: process.env.DEEPSEEK_MODEL`,
so it cannot witness a client swap — step 3.2 fixes that, and until it does, only
`usage.client` is trustworthy. Production's `specHash` *does* include the model, so
swapping `DEEPSEEK_MODEL` invalidates the cache correctly; a `ClientRegistry` swap
does not, which is why the eval never goes near `CachedVacancyExtractor`. promptfoo
keeps its own cache on top: `--no-cache`, always.

**A single run is noisy.** Measured on the first two runs: F1 67.0% then 63.8%,
same extractor, same rows, same snapshot. The scorer is deterministic, so that
spread is the model. `--repeat` exists for this; a gap of a few points between two
single runs means nothing.

**Any change to the VERIFIED node set re-extracts the whole corpus.** `identity()`
hashes roles, domains and skills into `taxonomyHash`, which feeds `specHash`, which
keys `extraction_artifacts`. A role cleanup therefore costs exactly what Pass 1's
cap raise costs, so the two must ship in one pass rather than two.

**The gate does not apply yet.** All 25 rows are `draft`, so `assertReleaseGate`
will not pass and must not be asked to — for a model choice the aggregate over the
same rows is the comparison. It starts biting in `requirement-groups.md` Pass 2,
when the 10 rows carrying a MUST group are approved per R7.

## Scope

Extraction quality only. The Fit shift that `requirement-groups.md` Pass 1 and
Pass 2 cause is invisible to this runner and is measured separately (§8 there).
