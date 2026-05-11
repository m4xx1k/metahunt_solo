// USD per 1M tokens. Sync with apps/etl/baml_src/clients.baml + OPENAI_MODEL
// env var when adding a model; the extraction_cost SQL view (migration
// 0009_extraction_cost_view_pricing_fix.sql) carries the same numbers as
// CASE branches and must be updated in lockstep.
export const MODEL_PRICING_USD_PER_MTOK = {
  "gpt-4o-mini":  { in: 0.15, out: 0.6,  cachedIn: 0.075 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5,  cachedIn: 0.075 },
} as const;

export type ModelName = keyof typeof MODEL_PRICING_USD_PER_MTOK;
