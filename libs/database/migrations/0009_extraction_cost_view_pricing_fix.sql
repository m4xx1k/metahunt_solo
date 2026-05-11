-- Redefine extraction_cost so cost_usd is computed per-model instead of
-- assuming gpt-4o-mini. The _usage sidecar gained a `model` field in
-- apps/etl/src/extraction/baml.extractor.ts; rows extracted before that
-- patch fall through the CASE and get cost_usd = NULL (which is more
-- honest than reporting a wrong number).
--
-- Pricing constants — keep in lockstep with apps/etl/src/extraction/pricing.ts:
--   gpt-4o-mini  in/out/cachedIn = 0.150 / 0.600 / 0.075 USD per Mtok
--   gpt-5.4-mini in/out/cachedIn = 0.750 / 4.500 / 0.075 USD per Mtok
--
-- DROP + CREATE rather than CREATE OR REPLACE because Postgres forbids
-- inserting a new column ("model") into the middle of an existing view's
-- column list (error 42P16). The view has no dependents, so this is safe.
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
      ELSE NULL
    END
  )::numeric, 6) AS cost_usd
FROM rss_records r
WHERE r.extracted_data ? '_usage';
