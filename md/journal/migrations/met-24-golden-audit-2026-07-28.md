# MET-24 — golden baseline audit (2026-07-28)

Read-only audit of `feat/MET-24-golden-set`. No extraction, embedding, migration, production
database write, or merge was performed. The only production access was the already-approved,
read-only taxonomy snapshot/preflight recorded in `taxonomy-role-v2.md`.

## Executive result

The 25-row artifact is **structurally reproducible**, but is not yet a calibration-ready golden
release. `pnpm golden validate` passes after the reviewed optional-skill cap fixes, and the
artifact has an immutable corpus/prompt/taxonomy/alias snapshot. The historical `prod` run scores
**56.9% core / 69.4% all fields**, but it is not a model benchmark: four rows are provider quota
failures and the run has no prompt/model/pipeline provenance. The scorer correctly counts those
four as zero rather than granting null-match credit.

The remaining release blocker is annotation provenance, not role-v2 migration status: 10 approved
dataset rows differ from the post-arbiter candidate in 11 field cells, but `decisions.json` cannot
say why the approved value superseded (or adopted) the arbiter. Those are manual-review items, not
safe automatic edits.

## Inventory and reproducibility

| item                          | observed value                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| pool / selected rows          | 10,720 / 25                                                         |
| sources                       | Djinni 18; DOU 7                                                    |
| label artifacts               | 25 approved decisions; no missing run outputs                       |
| extraction failures           | 4/25 (16.0%), all provider quota errors                             |
| immutable evaluation snapshot | prompt v3; 41 roles, 25 domains, 1,216 skills, 9,693 aliases        |
| scorer                        | `pnpm golden score --run prod`; snapshot aliases only, no DB or LLM |
| structural check              | `pnpm golden validate` passes                                       |

The snapshot makes aliases reproducible. It does not retroactively give `runs/prod.json` its own
model, prompt, pipeline, or source-corpus provenance, so that run is labelled **historical** by
the CLI and must not be used as a calibration baseline.

## Historical run decomposition

| metric                                                  |                 value |
| ------------------------------------------------------- | --------------------: |
| core fields (`isTech`, role, skills, seniority, salary) |                 56.9% |
| all 15 fields                                           |                 69.4% |
| missing output                                          |                     0 |
| recorded extraction failure                             |             4 (16.0%) |
| `isTech`                                                |                 40.0% |
| role / seniority / skills                               | 56.0% / 56.0% / 52.6% |
| salary / locations / work format                        | 80.0% / 76.0% / 76.0% |

`isTech` is not interpretable as a normal 40% model score: eight successful historical outputs do
not contain that field at all, while four other rows failed outright. The remaining three misses
are actual `false` versus golden `true` values. Treat this as a run-schema/provenance defect plus
three extraction disagreements, not 15 independent quality failures.

The failed IDs are `ae3cb4b6-ef09-4b66-8b12-6668c8c298cd`,
`127749e3-9277-4842-bb5c-d32583e18c43`, `52c83a7f-6eb8-48cf-8ecb-e9d0e57bc70e`, and
`4f4e000c-089d-4a4e-9165-de6fb698c8e8`. Each recorded an upstream quota error; none is evidence
of a wrong field extraction.

## Field policy and decisions required

| field                               | canonical policy for a future release                                             | observed defect / score impact                                                                                                                                          | required decision                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `locations` + `workFormat`          | locations are explicit hiring city/country; remote/hybrid is `workFormat`         | current `{city,country}` cannot represent country-only, EU/global eligibility, multi-region, or remote as a location; direct F1 turns representational loss into a miss | add per-field `notScorable` before scoring those cases; define country/region and multi-location handling         |
| `salary`                            | stated cash min/max, currency, period, gross/net; retain `from`/`up to` semantics | current shape scores only min/max/currency and assumes an unstated monthly basis; hourly, annual, equity, gross/net cannot be represented                               | extend shape or mark those cases `notScorable`; choose conversion and gross/net policy before broad salary claims |
| `role` + `domain`                   | exact VERIFIED value under the snapshotted taxonomy and aliases                   | role-v2 itself is applied, but labels that overrode arbiter candidates lack rationale; taxonomy cannot decide a source-evidence dispute                                 | retain current snapshot; manually resolve the queue below with evidence/rationale                                 |
| `seniority` + `experienceYears`     | title first; explicit numeric minimum or lower range bound only                   | Head/Lead/C-level and Trainee/Junior ranges are policy-sensitive; `0` years and `null` are materially different                                                         | define boundary precedence; label qualitative-only claims as `null`, not invented years                           |
| `employmentType` + `engagementType` | legal arrangement and primary company model only when explicit                    | `FULL_TIME` and `PRODUCT` are easily inferred from schedule/company branding; historical null/false matches can inflate easy fields                                     | prohibit inference; define product/startup precedence and use `null` where unstated                               |
| `skills`                            | named hard skills; required/optional independent; max 10/5                        | cap violations were removed, but required-vs-optional and generic/process skills are still policy-dependent; several approved values override candidates silently       | define generic-skill exclusion and require override rationale; retain ordered sets only as display, score as sets |
| boolean flags                       | true/false only from explicit source wording; otherwise `null`                    | historical false values can disagree with a deliberately unknown golden value                                                                                           | add explicit-false examples before reporting robust accuracy                                                      |
| `_error` / missing run output       | unavailable record, hard-zero score, reported separately                          | prior scorer could null-match failed output; now fixed                                                                                                                  | keep failure and missing rates alongside every future score                                                       |

`null` remains a scored statement of absence. `notScorable` is an exclusion with a reason, not a
third spelling of null; it is required to separate an extraction miss from a contract that cannot
express the source fact.

## Manual-review queue

These entries require source-evidence review and a recorded `adopted-arbiter` or
`superseded-arbiter` rationale. Do not update them mechanically.

| ID                                     | fields                                 | why it is a review item                                                                                       |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ae3cb4b6-ef09-4b66-8b12-6668c8c298cd` | skills                                 | approved optional skills differ from arbiter (`ElasticSearch` versus `Feathers.js`)                           |
| `52c83a7f-6eb8-48cf-8ecb-e9d0e57bc70e` | skills                                 | approved optional `Vector Databases` differs from arbiter `Haystack`                                          |
| `a06e6d98-332c-4605-92eb-8992f8fd147a` | domain                                 | approved `SaaS` differs from arbiter `Customer Support`                                                       |
| `ff9765ef-de34-4382-aeb4-ca26c0a219eb` | experience years; location/work format | approved `0` differs from unresolved candidate `null`; hybrid plus London needs the location/remote policy    |
| `13a0fd86-dfac-44bb-9845-4242a139d405` | skills, domain                         | approved security-skill set and `Fintech` differ from arbiter set and `Insurance`                             |
| `00ce1ec9-f15e-4309-a6f6-2a0faa6935a2` | role                                   | approved `Automation QA Engineer` differs from arbiter `QA Engineer` under role-v2                            |
| `e33ce465-c738-4ca6-8db7-f0e923e64083` | skills                                 | approved set differs from candidate; source also contains multi-location/remote salary context                |
| `0cbdf1dc-08e3-4c03-a720-636cc41143ef` | skills, domain                         | approved hardware QA set differs from candidate; `Hardware` needs exact-domain evidence                       |
| `5596ee51-a05c-4523-bcb8-384ea7d14653` | skills, salary                         | approved skills differ from candidate; `$670–1800` needs period/gross-net evidence before salary benchmarking |
| `0093c6a8-1f44-467a-839a-68e4a0b69294` | English level                          | approved `INTERMEDIATE` differs from candidate `ADVANCED`                                                     |

The four provider-failure IDs above need re-extraction only after a provenance-enabled run is
created; they do not need relabelling merely because their historical extraction failed.

## Dependency map

```text
VERIFIED taxonomy + alias rules
          ↓ snapshot (roles, domains, skills, aliases)
prompt contract + prompt hash ───────→ extraction run + run provenance
                                             ↓
source corpus hash → golden labels + review rationale → offline scorer
                                                        ↓
                                 calibration report (field score, missing, failures, exclusions)
```

Role-v2 is no longer an operational gate: its production dry-run was all `SKIP` and integrity
checks were zero. Taxonomy remains a semantic dependency because role/domain scoring must use the
same snapshot that informed the prompt and labels.

## Ordered next steps

1. **Approve the annotation contract**: `notScorable`, salary period/gross-net, country/region
   locations, seniority boundaries, and employment/engagement precedence. **Risk: high** — this
   changes what an accuracy number means.
2. **Add rationale/provenance fields to decisions and resolve the 10 rows above**; retain both
   candidate and final value. **Risk: medium** — labels change only after evidence review.
3. **Expand the sample** with deliberately difficult salary, location, false-boolean, non-tech,
   and seniority cases, keeping the existing source strata. **Risk: medium** — selection bias if
   added without a documented sampling rule.
4. **Add run provenance and per-field exclusions to the scorer**, then validate an immutable
   release candidate. **Risk: low** for code, high if used to compare historical runs.
5. **Run a new extraction only with explicit approval for model/provider cost**, pinned prompt,
   taxonomy snapshot, aliases, corpus hash, and pipeline version. **Risk: cost/external state**.

Suggested small commits, after approval: (a) decision rationale schema + structural validator,
(b) `notScorable` label/scoring representation, (c) targeted sample expansion, (d) run provenance
sidecar. None should be merged into `main` until its own review is complete.
