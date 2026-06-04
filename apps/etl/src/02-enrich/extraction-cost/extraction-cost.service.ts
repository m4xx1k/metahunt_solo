import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

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

type TotalsRow = {
  count: string | number;
  failures: string | number;
  tokens_in: string | number | null;
  tokens_out: string | number | null;
  tokens_cached: string | number | null;
  cost_usd: string | number | null;
};

function toTotals(row: TotalsRow | undefined): ExtractionCostTotals {
  if (!row) {
    return {
      count: 0,
      failures: 0,
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      costUsd: 0,
    };
  }
  return {
    count: Number(row.count ?? 0),
    failures: Number(row.failures ?? 0),
    tokensIn: Number(row.tokens_in ?? 0),
    tokensOut: Number(row.tokens_out ?? 0),
    tokensCached: Number(row.tokens_cached ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
  };
}

@Injectable()
export class ExtractionCostService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async summary(): Promise<ExtractionCostSummary> {
    const [totalRes, last24hRes, versionRes, modelRes, recentRes] =
      await Promise.all([
        this.db.execute<TotalsRow>(sql`
          SELECT
            COUNT(*)                                  AS count,
            COUNT(*) FILTER (WHERE is_failure)        AS failures,
            COALESCE(SUM(tokens_in), 0)               AS tokens_in,
            COALESCE(SUM(tokens_out), 0)              AS tokens_out,
            COALESCE(SUM(tokens_cached), 0)           AS tokens_cached,
            COALESCE(SUM(cost_usd), 0)                AS cost_usd
          FROM extraction_cost
        `),
        this.db.execute<TotalsRow>(sql`
          SELECT
            COUNT(*)                                  AS count,
            COUNT(*) FILTER (WHERE is_failure)        AS failures,
            COALESCE(SUM(tokens_in), 0)               AS tokens_in,
            COALESCE(SUM(tokens_out), 0)              AS tokens_out,
            COALESCE(SUM(tokens_cached), 0)           AS tokens_cached,
            COALESCE(SUM(cost_usd), 0)                AS cost_usd
          FROM extraction_cost
          WHERE extracted_at >= NOW() - INTERVAL '24 hours'
        `),
        this.db.execute<TotalsRow & { prompt_version: number | null }>(sql`
          SELECT
            prompt_version,
            COUNT(*)                                  AS count,
            COUNT(*) FILTER (WHERE is_failure)        AS failures,
            COALESCE(SUM(tokens_in), 0)               AS tokens_in,
            COALESCE(SUM(tokens_out), 0)              AS tokens_out,
            COALESCE(SUM(tokens_cached), 0)           AS tokens_cached,
            COALESCE(SUM(cost_usd), 0)                AS cost_usd
          FROM extraction_cost
          GROUP BY prompt_version
          ORDER BY prompt_version NULLS LAST
        `),
        this.db.execute<TotalsRow & { model: string | null }>(sql`
          SELECT
            model,
            COUNT(*)                                  AS count,
            COUNT(*) FILTER (WHERE is_failure)        AS failures,
            COALESCE(SUM(tokens_in), 0)               AS tokens_in,
            COALESCE(SUM(tokens_out), 0)              AS tokens_out,
            COALESCE(SUM(tokens_cached), 0)           AS tokens_cached,
            COALESCE(SUM(cost_usd), 0)                AS cost_usd
          FROM extraction_cost
          GROUP BY model
          ORDER BY count DESC
        `),
        this.db.execute<{
          id: string;
          extracted_at: Date;
          prompt_version: number | null;
          model: string | null;
          client: string | null;
          tokens_in: number;
          tokens_out: number;
          tokens_cached: number;
          is_failure: boolean;
          cost_usd: string | number | null;
        }>(sql`
          SELECT id, extracted_at, prompt_version, model, client,
                 tokens_in, tokens_out, tokens_cached, is_failure, cost_usd
          FROM extraction_cost
          ORDER BY extracted_at DESC
          LIMIT 50
        `),
      ]);

    return {
      total: toTotals(totalRes.rows[0]),
      last24h: toTotals(last24hRes.rows[0]),
      byPromptVersion: versionRes.rows.map((r) => ({
        promptVersion: r.prompt_version,
        ...toTotals(r),
      })),
      byModel: modelRes.rows.map((r) => ({
        model: r.model,
        ...toTotals(r),
      })),
      recent: recentRes.rows.map((r) => ({
        id: r.id,
        extractedAt:
          r.extracted_at instanceof Date
            ? r.extracted_at.toISOString()
            : String(r.extracted_at),
        promptVersion: r.prompt_version,
        model: r.model,
        client: r.client,
        tokensIn: Number(r.tokens_in ?? 0),
        tokensOut: Number(r.tokens_out ?? 0),
        tokensCached: Number(r.tokens_cached ?? 0),
        isFailure: r.is_failure,
        costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
      })),
    };
  }
}
