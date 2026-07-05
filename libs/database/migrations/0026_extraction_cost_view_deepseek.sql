-- Add deepseek-v4-flash to the extraction_cost per-model pricing CASE.
-- Extraction switched from gpt-5.4-mini (OpenAI) to deepseek-v4-flash via the
-- DeepSeek official API; the historical OpenAI branches stay so pre-switch rows
-- keep costing correctly.
--
-- Pricing constants — keep in lockstep with apps/etl/src/02-enrich/extraction/pricing.ts:
--   gpt-4o-mini       in/out/cachedIn = 0.150 / 0.600 / 0.075  USD per Mtok
--   gpt-5.4-mini      in/out/cachedIn = 0.750 / 4.500 / 0.075  USD per Mtok
--   deepseek-v4-flash in/out/cachedIn = 0.140 / 0.280 / 0.0028 USD per Mtok
--
-- DROP + CREATE (not CREATE OR REPLACE): safe because the view has no dependents,
-- and it lets the column list stay stable across redefinitions.
DROP VIEW IF EXISTS extraction_cost;
CREATE VIEW extraction_cost AS
SELECT
  r.id,
  r.source_id,
  r.extracted_at,
  (r.extracted_data->>'_v')::int                                AS prompt_version,
  (r.extracted_data->'_usage'->>'client')                       AS client,
  (r.extracted_data->'_usage'->>'model')                        AS model,
  (r.extracted_data->'_usage'->>'in')::int                      AS tokens_in,
  (r.extracted_data->'_usage'->>'out')::int                     AS tokens_out,
  COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)     AS tokens_cached,
  (r.extracted_data->>'_error') IS NOT NULL                     AS is_failure,
  ROUND((
    CASE (r.extracted_data->'_usage'->>'model')
      WHEN 'gpt-4o-mini' THEN
        GREATEST(((r.extracted_data->'_usage'->>'in')::int
                  - COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)), 0) * 0.150 / 1e6
        + (r.extracted_data->'_usage'->>'out')::int * 0.600 / 1e6
        + COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0) * 0.075 / 1e6
      WHEN 'gpt-5.4-mini' THEN
        GREATEST(((r.extracted_data->'_usage'->>'in')::int
                  - COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)), 0) * 0.750 / 1e6
        + (r.extracted_data->'_usage'->>'out')::int * 4.500 / 1e6
        + COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0) * 0.075 / 1e6
      WHEN 'deepseek-v4-flash' THEN
        GREATEST(((r.extracted_data->'_usage'->>'in')::int
                  - COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)), 0) * 0.140 / 1e6
        + (r.extracted_data->'_usage'->>'out')::int * 0.280 / 1e6
        + COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0) * 0.0028 / 1e6
      ELSE NULL
    END
  )::numeric, 6) AS cost_usd
FROM rss_records r
WHERE r.extracted_data ? '_usage';
