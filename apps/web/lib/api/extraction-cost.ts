// Hand-mirrored types for the ETL `/extraction-cost` endpoints.
// Source of truth: apps/etl/src/extraction-cost/extraction-cost.service.ts.
// Per ADR-0005 we duplicate types here until a second consumer justifies
// extracting libs/contracts.

import { apiGet } from "./client";

export interface ExtractionCostTotals {
  count: number;
  failures: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd: number;
}

export interface ExtractionCostByVersion extends ExtractionCostTotals {
  promptVersion: number | null;
}

export interface ExtractionCostByModel extends ExtractionCostTotals {
  model: string | null;
}

export interface ExtractionCostRecent {
  id: string;
  extractedAt: string;
  promptVersion: number | null;
  model: string | null;
  client: string | null;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  isFailure: boolean;
  costUsd: number | null;
}

export interface ExtractionCostSummary {
  total: ExtractionCostTotals;
  last24h: ExtractionCostTotals;
  byPromptVersion: ExtractionCostByVersion[];
  byModel: ExtractionCostByModel[];
  recent: ExtractionCostRecent[];
}

export const extractionCostApi = {
  summary: () => apiGet<ExtractionCostSummary>("/extraction-cost/summary"),
};
