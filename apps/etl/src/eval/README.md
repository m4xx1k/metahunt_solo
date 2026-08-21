# Vacancy Requirements v2 evaluation

This is the small, offline Langfuse evaluation for raw vacancy extraction. It
runs the production `BamlVacancyExtractor` directly, adapts today's
`skills.required`/`skills.optional` output to singleton requirements for the
baseline, and scores the future `{ priority, value | anyOf }` contract locally.
It does not change BAML, persistence, matching, or production tracing.

## One command

The safe command renders only cases supplied from reviewed sources; it never
creates synthetic vacancy fragments or labels. It makes no database, LLM,
Langfuse, or other external call:

```bash
pnpm eval:requirements-v2 -- --dry-run --legacy-dataset /path/to/reviewed-dataset.json
```

The legacy file stays user-owned: it is read only to verify its reviewed rows.
It is never copied into this PR. Its rows
deliberately contain a source-text placeholder. The ten targeted boundaries are
a separate local-only JSON array derived from real vacancy source text and
manually labelled; pass it with `--targeted-dataset`. The Langfuse dataset must
retain the source text and only the four fields below, with all items initially
marked `draft`:

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
  --legacy-dataset /path/to/reviewed-dataset.json \
  --targeted-dataset .scratch/real-boundary-cases.json \
  --out .scratch/vacancy-requirements-v2-draft.json
```

`--targeted-dataset` must contain exactly ten real, `draft` cases. The human
reviewer corrects `requirements` and changes `reviewStatus` to `approved`;
difficult rows remain draft. Raw vacancy text and this local target file never
enter Git.

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
