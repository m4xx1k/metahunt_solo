# Extraction cost & prompt versioning

How to bump the BAML prompt, capture the change in the cost ledger, and read what was spent.

## Where the numbers come from

Every successful or failed BAML extraction writes a sidecar into `rss_records.extracted_data`:

```json
{
  "_v": 2,
  "_usage": {
    "in": 4589, "out": 178, "cached": 0,
    "client": "OpenAIClient",
    "provider": "openai",
    "model": "gpt-5.4-mini",
    "ms": 6659
  },
  "_error": "..."            // present only on failure; data fields then absent
}
```

The `extraction_cost` SQL view (migration `0009`) parses this JSON, joins per-model pricing as `CASE` branches, and exposes `cost_usd`. Rows missing `_usage.model` (extracted before migration `0009`) get `cost_usd = NULL`.

## Bumping the prompt

1. Edit `apps/etl/baml_src/extract-vacancy.baml` — the schema, descriptions, `prompt #"..."#` body, or anything else.
2. Run `pnpm --filter etl baml:generate` to regenerate `apps/etl/src/baml_client/`. Commit the generated files together with the .baml change.
3. Bump `PROMPT_VERSION` in `apps/etl/src/extraction/baml.extractor.ts` to the next integer (1, 2, 3 …). The constant is the only thing the cost view groups on; whitespace-only edits don't need a bump.
4. Run `pnpm --filter etl exec baml-cli test --from baml_src` to sanity-check both fixtures (`senior_backend_remote`, `dou_fullstack_talanovyti`).
5. `pnpm --filter etl test` for unit tests.

## Re-extracting after a bump

`extract-missing` only processes records where `extracted_at IS NULL` — it won't refresh existing rows.

To force a refresh on every record (cost in OpenAI calls — at gpt-5.4-mini, ~$0.002 per record):

```bash
# All records, oldest first.
pnpm exec ts-node --project tsconfig.json apps/etl/scripts/reextract-vacancies.ts

# Limit to N for testing.
pnpm exec ts-node --project tsconfig.json apps/etl/scripts/reextract-vacancies.ts 5
```

The script bypasses Temporal (in-process), prints per-batch progress + final token total + USD cost.

## Querying the spend

```sql
-- Spend per prompt version
SELECT prompt_version, COUNT(*) AS n,
       SUM(tokens_in) AS tok_in, SUM(tokens_out) AS tok_out,
       ROUND(SUM(cost_usd)::numeric, 4) AS usd
FROM extraction_cost
GROUP BY prompt_version
ORDER BY prompt_version NULLS LAST;

-- Cache hit rate per model
SELECT model,
       SUM(tokens_cached) AS cached,
       SUM(tokens_in) AS total_in,
       ROUND(100.0 * SUM(tokens_cached) / NULLIF(SUM(tokens_in), 0), 1) AS hit_pct
FROM extraction_cost
WHERE model IS NOT NULL
GROUP BY model;

-- Today
SELECT COUNT(*) AS n,
       COUNT(*) FILTER (WHERE is_failure) AS failures,
       ROUND(SUM(cost_usd)::numeric, 4) AS usd
FROM extraction_cost
WHERE extracted_at >= CURRENT_DATE;
```

Or hit `GET /extraction-cost/summary` on the ETL backend, or open `/dashboard/extraction` on the web app.

## Adding a new model

1. Add the entry to `MODEL_PRICING_USD_PER_MTOK` in `apps/etl/src/extraction/pricing.ts`.
2. Add a `WHEN '<model>' THEN ...` branch to the `cost_usd` CASE in a new migration (`CREATE OR REPLACE VIEW extraction_cost AS ...` — column shape doesn't change, so no DROP needed).
3. Both files reference each other in comments — keep the constants in lockstep.

## Caveats

- **Failure rows are best-effort.** The activity writes `{ _v, _usage, _error }` before re-throw, so failed-attempt cost lands in the view. But if Temporal retries and the next attempt succeeds, the success-row overwrites the failure-row — that one attempt's cost is lost. Acceptable approximation; most failures spend zero tokens anyway. → See [migration tracker](../journal/migrations/extraction-prompt-v2.md#decisions).
- **Old rows are version-NULL.** Records extracted before the `_v` sidecar landed appear under `prompt_version = NULL` in the breakdown. They won't be re-versioned without a re-extract.
- **Taxonomy is cached.** `BamlVacancyExtractor` caches the VERIFIED ROLE + DOMAIN canonical lists for 60 s per instance. If you add a VERIFIED node and want it visible to the prompt immediately, restart the ETL process or wait one TTL window.
