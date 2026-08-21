# Vacancy Requirements v2 evaluation

This is the small, offline Langfuse evaluation for raw vacancy extraction. It
runs the production `BamlVacancyExtractor` directly, adapts today's
`skills.required`/`skills.optional` output to singleton requirements for the
baseline, and scores the future `{ priority, value | anyOf }` contract locally.
It does not change BAML, persistence, matching, or production tracing.

## One command

The safe command produces the 25-case draft plan (15 existing reviewed rows,
five explicit-OR rows, and five competency/methodology rows) without contacting
the database, an LLM, Langfuse, or any other external service:

```bash
pnpm eval:requirements-v2 -- --dry-run --legacy-dataset apps/etl/golden/role-contract-v1/dataset.json
```

The legacy file stays user-owned: it is read only to verify that at least 15
reviewed rows are available. It is never copied into this PR. The proposed
25-case dry-run renders their singleton requirement labels plus ten targeted
draft cases. Its legacy rows deliberately contain a source-text placeholder:
replace that from the reviewed source before uploading. The Langfuse dataset
must retain the source text and only the four fields below, with all items
initially marked `draft`:

```json
{
  "input": { "id": "vacancy-id", "title": "Senior Backend Engineer", "text": "source text" },
  "expectedOutput": {
    "isTech": true,
    "role": "Backend Engineer",
    "seniority": "SENIOR",
    "requirements": [{ "priority": "must", "anyOf": ["AWS", "GCP"] }]
  },
  "metadata": { "reviewStatus": "draft", "slices": ["or"], "contractVersion": "requirements-v2" }
}
```

To prepare the local upload file with the actual reviewed vacancy text, use a
read-only production URL. The output is local-only, mode `0600`, ignored by Git,
and no Langfuse API call occurs:

```bash
DATABASE_URL="$(scripts/prod-db-url.sh)" pnpm eval:requirements-v2 -- --prepare-draft \
  --legacy-dataset apps/etl/golden/role-contract-v1/dataset.json \
  --out .scratch/vacancy-requirements-v2-draft.json
```

Targeted draft rows cover `PyTorch or TensorFlow`, `Prisma or TypeORM`, `AWS or
GCP`, `Selenium/Cypress/Playwright`, and hard requirements such as API Testing,
Distributed Systems, System Design, TDD/BDD, and explicitly required Scrum.
The human reviewer corrects only `requirements` and changes `reviewStatus` to
`approved`; difficult rows remain draft.

## Langfuse smoke

After the draft is reviewed and uploaded to Langfuse, the same command runs the
hosted versioned dataset, real extractor, named per-item scores, and run-level
scores. It reads `../.env.langfuse`; do not commit that file.

```bash
pnpm eval:requirements-v2 -- --live --dataset metahunt/vacancy-requirements-v2 --dataset-version 2026-08-21T00:00:00Z --run-name baseline-current-skills
```

`--live` needs `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional
`LANGFUSE_BASE_URL`, plus `DATABASE_URL`, `DEEPSEEK_API_KEY`, and
`DEEPSEEK_MODEL`. It is intentionally manual because it calls the provider and
writes traces and scores to Langfuse. The command configures and flushes an
offline OpenTelemetry span processor; it does not add production tracing.

The run records the dataset version, Requirements contract version, BAML/spec
identity, model/provider, and frozen taxonomy hash. Score names are
`schema_valid`, `provider_failure`, requirement precision/recall/F1, priority
and alternative accuracy, `or_split_errors`, and the three regression guards.
Aliases use production `normalizeAliasName`; unknown names retain a stable
`unresolved:` key until taxonomy curation catches up.

Only approved rows participate in the release gate. It requires schema validity
of 100%, zero provider failures, at least one approved OR boundary, and zero OR
splits. Draft rows can be explored in the same Langfuse dataset but cannot pass
the gate. Compare baseline and future Requirements v2 runs in the Langfuse UI
only when they use the same dataset version and taxonomy identity.
