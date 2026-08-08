# ADR-0015 — Golden evaluation policy v1

**Status:** accepted
**Date:** 2026-08-08
**Context (in time):** MET-24 extraction-quality release gate

## Context

The golden corpus has human-approved values but no stable answer for the cases
where a source fact does not fit the current extraction shape. Treating those
cases as ordinary errors makes a model score measure schema loss and reviewer
intuition rather than extraction quality. The current BAML contract has 15
fields; the older “14 fields” wording predates `isTech` and must not be reused.

## Options

### Option A — Force every source fact into the current shape

- ✅ one apparent accuracy number
- ❌ turns country-only locations, hourly/equity compensation, and missing policy
  into fake model failures or invented values

### Option B — Add a new schema property for every edge case now

- ✅ can preserve more raw detail
- ❌ grows the user-facing contract before we know which cases matter; makes
  historical comparison and review slower

### Option C — Conservative v1 policy plus explicit field exclusions

- ✅ preserves a small schema; `null`, a model miss, and an unrepresentable
  source fact remain distinct
- ✅ lets targeted counterexamples prove which schema extensions are justified
- ❌ reports fewer scoreable cells until policy and shape mature

## Decision

Choose **Option C**. The field rules below are the proposed v1 annotation and
scoring policy. A reviewer uses `notScorable` only with source evidence and one
of the four machine-readable reasons: `schema-limitation`, `policy-pending`,
`taxonomy-gap`, or `source-ambiguous`.

| Field group                      | Proposed v1 rule                                                                                                                                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isTech`                         | `true` for engineering, QA, data, security, embedded, and management of those; `false` for non-technical functions. When the title/source is genuinely unclear, preserve the source and mark the field `source-ambiguous`; do not use company type as a proxy.                    |
| `role`, `domain`                 | Compare only exact values in the frozen VERIFIED taxonomy plus its frozen aliases. A stated but absent taxonomy value is `taxonomy-gap`, not a made-up nearest neighbour.                                                                                                         |
| `skills`                         | Record named hard technical skills only. Required means explicit requirement; optional means explicit “plus”/optional wording. Exclude soft skills, processes, generic categories, and certifications. Do not convert a combined spelling into an invented taxonomy item.         |
| `seniority`, `experienceYears`   | Explicit title seniority wins. Numeric years use an explicit minimum or range lower bound. `0` requires explicit “no experience required”; trainee/junior alone is not `0`.                                                                                                       |
| `salary`                         | Score standard cash salary with stated/implicit monthly values and deterministic annual ÷12 conversion. Retain one-sided `from`/`up to`. Hourly, equity-only, or compensation where gross/net changes the claim is `schema-limitation` until the shape can retain that qualifier. |
| `workFormat`, `locations`        | Work format is the remote/office/hybrid policy. Locations are explicit office/hub cities only; include all of them. Country/region eligibility without a city is `schema-limitation`, not an empty list.                                                                          |
| `englishLevel`, `employmentType` | Only explicit CEFR/language mappings and explicitly named legal employment types are scoreable. FOP is `CONTRACT`; schedule is not evidence of `FULL_TIME`.                                                                                                                       |
| `engagementType`, `companyName`  | Name the company only when posted. Score an engagement model only where company text actually distinguishes it; otherwise `null`, not a product/startup guess.                                                                                                                    |
| boolean flags                    | `true` and `false` both require explicit source wording. `null` means the source is silent; it is scoreable and is never an exclusion.                                                                                                                                            |

## Consequences

- A new release must preserve the 15-field contract, policy version, corpus,
  prompt, taxonomy, aliases, and run provenance together.
- Existing labels are not rewritten by this ADR. The 13 legacy overrides require
  source-evidence review before they can form a v1 release.
- A later field addition or semantic change creates a new snapshot and release;
  scores across contracts are not directly comparable.
- The smallest useful infrastructure is the committed corpus/manifest/snapshot,
  review decisions, run sidecar, `golden validate`, `golden release-check`, and
  `golden score`. No service, migration, or production database write is needed.
