# Vacancy role golden set

`golden-set.role-contract.v1.json` is the small, versioned input to the future
opt-in prompt evaluation. It is **not** production input and it never triggers
a model call by itself.

## Review workflow

1. Read each `text` and its expected `isTech`, discipline `role`, seniority,
   and rationale.
2. Edit a draft label if needed; use `null` when the approved contract says the
   value must not be inferred.
3. Change `reviewStatus` to `approved` only when a human accepts that label.
   Use `rejected` for an invalid or redundant case; do not delete its history.
4. Before a paid evaluation, extend this draft with 40–60 approved,
   production-derived and de-identified cases. Keep source IDs outside Git if
   they are needed for internal traceability.

The evaluator will refuse to make live model calls unless every selected case is
approved. It captures the live VERIFIED taxonomy at evaluation time, rather
than pretending this draft's small role list is a production taxonomy snapshot.
