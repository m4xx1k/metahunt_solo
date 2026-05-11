CREATE OR REPLACE VIEW extraction_cost AS
SELECT
  r.id,
  r.source_id,
  r.extracted_at,
  (r.extracted_data->>'_v')::int                                AS prompt_version,
  (r.extracted_data->'_usage'->>'client')                       AS client,
  (r.extracted_data->'_usage'->>'in')::int                      AS tokens_in,
  (r.extracted_data->'_usage'->>'out')::int                     AS tokens_out,
  COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)     AS tokens_cached,
  (r.extracted_data->>'_error') IS NOT NULL                     AS is_failure,
  -- gpt-4o-mini pricing: in/out/cachedIn = 0.150 / 0.600 / 0.075 USD per Mtok.
  -- Sync with apps/etl/src/extraction/pricing.ts. If more than one model
  -- ships, move the math into a TS report script.
  ROUND((
    GREATEST(
      ((r.extracted_data->'_usage'->>'in')::int
       - COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0)),
      0
    ) * 0.150 / 1e6
    + (r.extracted_data->'_usage'->>'out')::int * 0.600 / 1e6
    + COALESCE((r.extracted_data->'_usage'->>'cached')::int, 0) * 0.075 / 1e6
  )::numeric, 6) AS cost_usd
FROM rss_records r
WHERE r.extracted_data ? '_usage';
