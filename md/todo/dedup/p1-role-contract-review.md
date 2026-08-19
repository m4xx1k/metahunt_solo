# P1 review: role contract before prompt or taxonomy changes

**Status:** owner-approved direction, 2026-08-18. This is intentionally a
decision memo, not an implementation plan to apply unattended.

## What is already true

- P0 now merges byte-identical content deterministically, so duplicate position
  splits are no longer a reason to alter role or seniority rules.
- A `VERIFIED` role is user-visible and is fed back into the vacancy prompt. A
  bad canonical therefore affects both browse filters and future extraction.
- The current prompt still contains obsolete examples such as `Backend
  Developer`, `ML Engineer`, `Mobile Developer`, and assigns `Architect` to
  `PRINCIPAL` unconditionally. The role-v2 plan renamed several of these
  canonical roles to `... Engineer` and says role should describe a discipline.
- Existing BAML fixture coverage is too small to decide whether a prompt or
  taxonomy change helps. A model call is not part of this preparation.

## Approved role contract

The owner approved the deliberately conservative defaults below. They are the
product contract for the golden set and any candidate prompt; an implementation
may not silently invent a different interpretation.

| Decision | Approved rule | Why it is the low-risk default |
| --- | --- | --- |
| What is a ROLE? | A discipline/job function, not a seniority level. | Keeps feed filters meaningful and avoids `Team Lead` competing with `Backend Engineer`. |
| `Lead` / `Team Lead` / `Tech Lead` | Preserve the underlying discipline as role; set seniority to `LEAD` only when the posting actually offers a lead role. | A lead backend vacancy stays findable under Backend. |
| `Architect` | Preserve an identifiable discipline (`Data Engineer`, `Security Engineer`, etc.); set `PRINCIPAL` as seniority only when the title/context supports that level. | Avoids making all architects one level regardless of company usage. |
| `CTO`, VP, Head of Engineering | Treat as leadership/seniority first; decide separately whether there is a browseable engineering-management discipline. Do not silently map all to a coding discipline. | Stops executive titles from polluting a technical specialty filter. |
| Generic `Software Engineer` | Do not use as the default fallback for a specific discipline. Keep it only as an explicit, reviewable escape hatch if the posting truly gives no discipline. | It is currently too broad to be a useful VERIFIED facet. |
| Full VERIFIED skill list in the prompt | Do not expand it further. Compare “no list” vs a small curated list on labelled cases before retaining it. | A ~1,200-name hint is expensive/noisy without measured value. |

## Where rules and prompt history live

Keep this deliberately small, with one job per layer:

1. **This file** is the human-readable contract: role/seniority meanings,
   accepted exceptions, and the golden-set acceptance gate. A rule change is a
   reviewed Git diff here first.
2. **`apps/etl/baml_src/extract-vacancy.baml`** is the executable model
   instruction. It must link back to this contract in a short comment; it does
   not become a second, undocumented policy.
3. **VERIFIED ROLE nodes** are the allowed production canonical values. A
   taxonomy migration is an explicit, separate reviewed change; it does not
   redefine the contract by accident.
4. **Golden-set labels and their evaluation report** enforce the contract.
   They are committed test/evaluation data, not hidden dashboard state.

### Prompt identity, comparison, and rollback

There is no need for a manual incrementing prompt-version system. P0 already
derives an immutable **`spec_hash`** from the production BAML source/client
configuration, BAML runtime, provider, exact model name, and VERIFIED taxonomy
hash. Together with the input hash it is the cache/audit key.

- A prompt, model, runtime, or VERIFIED-taxonomy change naturally gets a new
  `spec_hash`; prior artifacts remain intact and cannot be accidentally reused.
- Git commit is the human-visible source revision. An optional short release
  label such as `role-contract-v1` may appear in an evaluation report, but must
  never be the correctness key.
- Compare two prompts by running the same labelled inputs explicitly against
  two checked-out source revisions and recording both spec hashes in one report.
- Roll back code by deploying/reverting to the earlier Git revision; its old
  spec hash isolates its cache entries automatically. A later re-extraction is
  a data migration and requires its own rollback plan—code rollback alone does
  not overwrite already stored vacancy fields.

This is enough lineage to answer “which prompt/model/taxonomy produced this
output?” without building a separate prompt registry.

## Golden-set proposal

Use an isolated **40–60 row working set of real vacancy texts**. MET-24 already
provides the reviewed corpus/release machinery and its default 25-row release
must remain immutable. Build the P1 working set with the same sampler under a
separate `GOLDEN_DIR`; it reads production only and stores the corpus obfuscated
locally. It is not a production write path.

The historical MET-24 labels are useful review evidence but are not automatically
P1 ground truth: they were made under the previous role taxonomy (for example,
they contain `CTO (Chief Technology Officer)` as a role). The new review covers
all extraction fields from actual vacancy text. `isTech`, `role`, and
`seniority` are reported as an explicit product slice, but never replace the
full-field score.

Minimum slices:

1. Backend / Frontend / Full Stack / generic Software Engineer boundary.
2. Data Engineer / Data Analyst / Data Scientist / ML Engineer / AI Engineer.
3. Architect titles: `Senior Architect`, `Solution Architect`, and a discipline
   plus `Architect`.
4. Lead titles: technical lead, people lead, and a title where `lead` is not a
   seniority signal.
5. CTO / VP / Head-of titles: technical and non-technical contexts.
6. QA parent/child boundary: QA, Manual QA, Automation QA, SDET.
7. Mobile parent/child boundary: iOS, Android, cross-platform.
8. Exact-content pairs whose previously stored role/seniority disagree.

For each example, a reviewer supplies only: `isTech`, expected discipline role
or `null`, expected seniority or `null`, and a one-line rationale. The point is
to decide contract boundaries, not to label every extracted field. A P1 set is
versioned by its corpus, prompt and taxonomy snapshot; it never rewrites the
historical MET-24 release.

## Evaluation gate

After the labels and decisions exist, run an explicit, cost-capped live BAML
evaluation outside Jest:

- pin the production spec/model/taxonomy hashes in the report;
- run each ambiguous case at least three times;
- report role accuracy, seniority accuracy, and per-field stability;
- compare current prompt against exactly one reviewed candidate change at a
  time;
- do not mutate vacancies, embeddings, taxonomy, or dedup groups during eval.

No change advances merely because it “feels cleaner”: it needs no regression on
the agreed golden set and a stated product reason for any trade-off.

## After approval

1. Make the smallest prompt/taxonomy edit matching the chosen contract.
2. Add golden-set assertions and deterministic unit tests around the affected
   mapping rules.
3. Run the opt-in evaluation and review its report.
4. Only then prepare a separate re-extraction/embedding/dedup migration with a
   dry-run, cost ceiling, rollback, and explicit production approval.

## Explicit non-actions in this pass

- No taxonomy status changes, merges, hides, or renames.
- No deployed BAML prompt/model change and no paid model calls.
- No re-extraction, re-embedding, dedup reset, or production mutation.

## Agreed seven-stage delivery plan

**End goal:** an approved role contract produces a measured improvement on a
labelled golden set, then only the reviewed prompt/taxonomy changes are rolled
out through a bounded, reversible production migration.

| Stage | Deliverable | Human checkpoint |
| --- | --- | --- |
| 1. Contract | This approved memo committed as the normative role/seniority contract. | None. |
| 2. Golden set | Minimal versioned schema, candidate cases, and reviewer checklist. | Approve or amend 40–60 labels. |
| 3. Eval tooling | Opt-in runner with dry-run default, identity capture, and a hard call limit. | None. |
| 4. Prompt candidate | One small BAML diff implementing the approved contract. | Review the diff before a live eval. |
| 5. Paid eval | Baseline-versus-candidate report, including three runs on ambiguous cases. | Approve model/budget and then review the report. |
| 6. Taxonomy dry-run | Exact rename/merge/hide plan with feed, track, and subscription impact. | Approve every taxonomy mutation. |
| 7. Production rollout | Bounded deploy/re-extraction plan, rollback and verification report. | Final go before any production mutation. |
