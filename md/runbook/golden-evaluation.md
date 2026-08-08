# Golden extraction evaluation

MET-24 is the offline quality gate for `extract-vacancy.baml`. It evaluates one
frozen corpus and never writes production data or calls an extractor by default.

## What a score means

A score compares one run to human-confirmed labels under one immutable snapshot:

```text
obfuscated corpus + prompt + verified taxonomy + aliases
                           ↓
                 reviewed labels + explicit exclusions
                           ↓
             provenance-bound extraction run → score report
```

`null` means “the source does not state this fact” and is scoreable. An exclusion
means “the source states a fact that this schema/policy cannot represent fairly”;
it must have a reason and source evidence. An exclusion is never a convenient way
to remove a model miss.

The scorer has 15 fields. Its core score is `isTech`, `role`, `skills`,
`seniority`, and `salary`; `all scoreable` contains every non-excluded field.
Failures and missing outputs score zero and are reported separately.

## Commands

Run from the repository root. None of the commands below invokes an LLM unless a
future runner explicitly does so.

| Command                                   | Reads / writes                        | Purpose                                                          |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `pnpm golden sample`                      | read-only DB → corpus, manifest       | deterministic 25-row (or configured) sample and diversity report |
| `pnpm golden snapshot`                    | read-only DB → snapshot               | pin corpus hash, prompt, taxonomy and aliases                    |
| `pnpm golden batch`                       | corpus, manifest → batches            | prompt-ready blind labelling batches                             |
| `pnpm golden merge`                       | labels, `runs/prod.json` → candidates | triage: agreement, production difference, contention             |
| `pnpm golden arbitrate`                   | candidates → arbiter template         | create only contested-field work                                 |
| `pnpm golden review`                      | candidates/corpus ↔ decisions/dataset | localhost review; records a human decision                       |
| `pnpm golden validate`                    | artifacts only                        | structural consistency; legacy artifacts may pass                |
| `pnpm golden score --run NAME`            | dataset, snapshot, run                | offline report; calls no provider                                |
| `pnpm golden:release-check -- --run NAME` | all release artifacts                 | strict gate for a comparable release                             |

`golden review` binds only to `127.0.0.1`; it serves decoded posting text and
must never be exposed on a LAN. The corpus encoding is obfuscation, not security.

## Artifact contract

| File                         | Owner            | Rule                                                  |
| ---------------------------- | ---------------- | ----------------------------------------------------- |
| `golden/corpus.enc.json`     | sampler          | source text, obfuscated and never silently replaced   |
| `golden/manifest.json`       | sampler          | selected IDs and coverage cells                       |
| `golden/snapshot.json`       | snapshot command | corpus/prompt/taxonomy/alias identity                 |
| `golden/labels/*.json`       | labellers        | independent proposals, never ground truth             |
| `golden/candidates.json`     | merge            | triage view, retains A/B/prod/arbiter values          |
| `golden/decisions.json`      | reviewer         | approved values, overrides, rationales and exclusions |
| `golden/dataset.json`        | review server    | frozen score inputs copied from approved decisions    |
| `golden/runs/NAME.json`      | runner           | extraction output only                                |
| `golden/runs/NAME.meta.json` | runner           | provider/model/commit and snapshot binding            |

The historical `runs/prod.json` has no `.meta.json`; it is inspectable but not a
comparable benchmark. Do not invent its provenance after the fact.

## Review rules

1. A human may override a merged candidate, but a changed value needs a concise
   rationale: `adopted-arbiter`, `superseded-arbiter`, or `manual-ruling`, plus
   source evidence or an accepted policy reference.
2. Use `not scorable` only with `schema-limitation`, `policy-pending`,
   `taxonomy-gap`, or `source-ambiguous`, and quote/point to the source evidence.
3. `null` is not an exclusion. If the source is silent, label `null` and score it.
4. Do not alter an approved row by rerunning merge. Review writes a value snapshot
   to the decision and dataset specifically to prevent that.
5. A run is comparable only when its metadata matches the exact corpus, prompt,
   taxonomy, and alias snapshot used for the labels.

## Release checklist

A dataset release is done only when all are true:

- structural validation passes;
- every changed human decision has an evidence-backed rationale;
- every excluded field has an allowed reason and evidence;
- the sample has documented coverage plus targeted counterexamples for known
  schema boundaries;
- `golden:release-check -- --run NAME` passes for a new provenance-bound run;
- the report separates missing output, provider failures, exclusions and model
  disagreements;
- a deliberate known degradation lowers the expected field score;
- policy changes or schema changes create a new snapshot/release rather than
  rewriting the old one.

## When the schema or policy changes

Changing an extraction field, salary representation, taxonomy semantics, aliases,
or comparator is a new measurement contract. Keep the old release unchanged;
write the decision in `md/journal/decisions/`, create a new snapshot, label only
the affected boundary cases, and score a new provenance-bound run. Never compare
scores across contracts as though they were the same metric.
