# Vacancy Requirements v2 evaluation

[`vacancy-requirements-v2.dataset.json`](./vacancy-requirements-v2.dataset.json)
is the review surface: 25 real vacancy texts and manual `draft` labels. There
is no legacy conversion and no data-preparation CLI.

After reviewing and uploading that exact dataset to Langfuse, run:

```bash
pnpm eval:requirements-v2 -- --dataset metahunt/vacancy-requirements-v2 --dataset-version <version> --run-name baseline-current-skills
```

The command needs `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional
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

Only approved rows participate in the release gate. Draft rows are for review
only and cannot pass it.
