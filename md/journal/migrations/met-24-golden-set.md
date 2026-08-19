# MET-24 — golden evaluation contract

Active. Owns the immutable evaluation corpus, its annotation contract, and offline scoring. It
does not authorize a production taxonomy migration, re-extraction, or an LLM call.

## Gates

1. Role-v2 must have an established operational state before role labels are frozen. See
   [`taxonomy-role-v2.md`](taxonomy-role-v2.md#re-run-gate-before-golden-set-work-2026-07-28).
2. `pnpm golden validate` must pass before an artifact is called a golden dataset. It currently
   identifies the known optional-skill cap violations and stale arbiter merge without rewriting
   any artifact.
3. A scored run must record its prompt, taxonomy, alias, pipeline, and model provenance. A live
   database alias table is not a reproducible scoring dependency.

## Contract hardening (2026-08-08)

- ✅ Rebased `feat/MET-24-golden-set` on current `main`; no production data or labels changed.
- ✅ Added decision-level rationale and per-field `notScorable` representation, plus a strict
  `golden release-check` gate. **Done when:** a new reviewed release can distinguish a policy or
  schema limitation from an extraction miss.
- ✅ Added optional `runs/<name>.meta.json` provenance bound to the immutable snapshot. **Done
  when:** a new scored run cannot be compared when corpus, prompt, taxonomy, aliases, provider,
  model, or pipeline commit are unknown.
- ✅ Accepted [policy v1](../decisions/0015-golden-evaluation-policy-v1.md) and reviewed all
  legacy overrides that changed the merged candidate: 3 evidence-backed rulings, 6 explicit
  exclusions, and 2 key-order-only false conflicts removed. **Done when:** `pnpm golden
release-check` passes for the dataset (it does).
- ✅ Archived the accepted working set as `v1-policy-2026-08-08` (25 rows, ADR-0015, 18 hashed
  artifacts) before a new sample can overwrite it. The archive command refuses replacement.
- ⏳ Add targeted boundary cases before expanding to 100. **Done when:** salary, location,
  boolean, non-tech, and seniority policy edges each have documented coverage.

## Proposed annotation contract

These defaults are deliberately conservative. They become normative only after owner acceptance,
then prompt, validation, and affected labels change together.

| field                                  | proposed canonical answer                                                                | score eligibility                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `isTech`                               | technical eligibility only                                                               | score as a separate gate; a false row does not score the remaining extraction fields        |
| `role`                                 | exact role from the snapshotted VERIFIED taxonomy                                        | score only against that snapshot and its aliases                                            |
| `seniority`                            | title wins; explicit ranges use their lower bound; otherwise only explicit numeric years | score ambiguous Head/VP and boundary-year cases only after a recorded ruling                |
| `skills`                               | named hard skills, required/optional separate, max 10/5                                  | reject generic/process skills and overflow rather than silently replacing them              |
| `experienceYears`                      | explicit minimum full years; a range uses its lower bound                                | null when a qualitative requirement has no numeric evidence                                 |
| `salary`                               | monthly cash range in USD/EUR/UAH; annual converts to monthly                            | hourly, equity, and a gross/net distinction are not scoreable until the shape supports them |
| `englishLevel`                         | explicit CEFR mapping                                                                    | score only stated levels                                                                    |
| `employmentType`                       | explicit legal arrangement; FOP maps to `CONTRACT`                                       | do not infer FULL_TIME from schedule or exclusivity                                         |
| `workFormat`                           | stated remote/office/hybrid policy                                                       | do not infer OFFICE from the work itself; remote-first with optional office is REMOTE       |
| `locations`                            | explicit hiring office or hub city/country only                                          | country, EU, global eligibility, and company-brand mentions are not city locations          |
| `domain`                               | exact snapshotted VERIFIED domain                                                        | a stated but off-taxonomy domain is preserved for review but excluded from canonical score  |
| `engagementType`                       | one primary company model, with documented precedence                                    | score only when evidence distinguishes the model; product/startup ambiguity is excluded     |
| `companyName`                          | posted company name, normalized for whitespace/case only                                 | score explicit, non-anonymized names                                                        |
| `hasTestAssignment` / `hasReservation` | true or false only when explicitly stated; otherwise null                                | add explicit-false cases before reporting a robust metric                                   |

## Required model changes before broad scoring

- Add a per-field `notScorable` reason to golden labels. It is not the same as `null`: `null` is
  a scored answer meaning the posting does not state the fact, while `notScorable` means the
  current contract cannot represent the stated fact without losing meaning.
- Store a per-run provenance sidecar: corpus hash, prompt version and hash, model/provider,
  pipeline version, VERIFIED taxonomy snapshot, and alias snapshot.
- Treat `_error` and missing output as unavailable records, with distinct failure and missing
  metrics. Both score zero; neither may collect null-match credit.
- Preserve arbiter values in `candidates.json` before review. A manual override remains valid, but
  it must say whether it superseded or adopted the arbiter.

## Sample expansion after the contract is accepted

Add targeted rows for hourly/yearly/gross/net/equity salary, from/up-to salary bounds, country and
region-only location, global remote eligibility, explicit false test/reservation, title ranges,
and non-tech eligibility. Keep the existing source/language/length strata, but sample missing
extraction separately from partial and successful extraction.

## Definition of done

A golden release is immutable and validates locally; every scored run is reproducible without a
live taxonomy lookup; failures are reported separately; and the calibration report names excluded
policy cases instead of converting them into apparent extraction errors.
