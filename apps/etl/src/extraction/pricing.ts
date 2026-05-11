// USD per 1M tokens. Source: OpenAI public pricing as of 2026-05.
// Sync with apps/etl/baml_src/clients.baml and OPENAI_MODEL env var when
// adding a new model; the extraction_cost SQL view assumes gpt-4o-mini.
export const MODEL_PRICING_USD_PER_MTOK = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, cachedIn: 0.075 },
} as const;

export type ModelName = keyof typeof MODEL_PRICING_USD_PER_MTOK;
