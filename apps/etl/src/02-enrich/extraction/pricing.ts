// USD per 1M tokens. Sync with apps/etl/baml_src/clients.baml + the model env
// var (DEEPSEEK_MODEL for extraction) when adding a model; the extraction_cost
// SQL view (latest: migration 0026_extraction_cost_view_deepseek.sql) carries
// the same numbers as CASE branches and must be updated in lockstep.
export const MODEL_PRICING_USD_PER_MTOK = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, cachedIn: 0.075 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5, cachedIn: 0.075 },
  // DeepSeek official API (platform.deepseek.com); cache-hit input is 50x cheaper.
  "deepseek-v4-flash": { in: 0.14, out: 0.28, cachedIn: 0.0028 },
} as const;

export type ModelName = keyof typeof MODEL_PRICING_USD_PER_MTOK;
