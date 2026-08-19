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

## Commands

```bash
# Default and safe: validates the dataset and prints a plan. No DB/model access.
pnpm eval:vacancy-extraction -- --dry-run

# Only after a human marks the selected cases approved. This is deliberately
# explicit and records a JSON report; it is never part of Jest or CI.
pnpm eval:vacancy-extraction -- --live --runs 3 --max-calls 180 \
  --max-cost-usd 5 --out .scratch/role-contract-v1.json
```

`--max-calls` is a hard pre-flight ceiling. `--max-cost-usd` stops additional
calls once observed provider usage reaches the declared budget; an individual
provider request can only be priced after it completes.

Run the baseline and candidate from their respective checked-out Git revisions,
then compare their saved reports offline. The comparison refuses different
golden-set versions and writes aggregate plus per-case metric deltas.

```bash
pnpm eval:vacancy-extraction:compare -- \
  --baseline .scratch/role-contract-baseline.json \
  --candidate .scratch/role-contract-candidate.json \
  --out .scratch/role-contract-comparison.json
```

## Production-candidate intake

This is a separate read-only command. It selects recent boundary cases and
prints source references plus cleaned extraction input locally; it never calls
a model and never writes the database.

```bash
DATABASE_URL="$(scripts/prod-db-url.sh)" pnpm eval:vacancy-intake -- --per-slice 6
```

Do not commit its raw output. A reviewer must de-identify and label only the
chosen cases before adding them to the golden set.
