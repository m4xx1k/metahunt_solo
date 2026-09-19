import type { ExtractionResult } from "../02-enrich/extraction/vacancy-extractor";

import { loadAliases } from "./dataset/aliases";
import { loadDataset } from "./dataset/load";
import { assertReleaseGate } from "./scoring/release-gate";
import { scoreRequirements, summarizeRequirements } from "./scoring/scorer";
import type {
  EvalExtractor,
  EvalRun,
  ExtractorName,
  ExtractedVacancyForEval,
  RequirementDatasetCase,
  RowResult,
  ScorerAliasMap,
} from "./types";

export type RunOptions = {
  extractor: EvalExtractor;
  extractorName: ExtractorName;
  concurrency: number;
  only?: string;
  onRow?: (row: RowResult) => void;
};

export async function runEval(
  options: RunOptions,
): Promise<{ run: EvalRun; cases: RequirementDatasetCase[] }> {
  const { aliases, sha: aliasSnapshotSha } = loadAliases();
  const cases = loadDataset().filter((item) => !options.only || item.input.id === options.only);
  if (cases.length === 0)
    throw new Error(`no dataset rows matched ${options.only ?? "the filter"}`);

  const startedAt = Date.now();
  const rows = await mapWithConcurrency(cases, options.concurrency, async (item) => {
    const row = await runCase(options.extractor, item, aliases);
    options.onRow?.(row);
    return row;
  });

  const approved = rows.filter((row) => row.reviewStatus === "approved");
  if (approved.length > 0) {
    assertReleaseGate(
      approved.map((row) => row.score),
      cases,
    );
  }
  // Draft-only runs are for inspection: show their aggregate, never claim a gate.
  const scored = approved.length > 0 ? approved : rows;
  return {
    cases,
    run: {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      extractor: options.extractorName,
      client: rows[0]?.usage.client ?? "unknown",
      model: rows[0]?.usage.model ?? "unknown",
      aliasSnapshotSha,
      gated: approved.length > 0,
      summary: summarizeRequirements(scored.map((row) => row.score)),
      rows,
    },
  };
}

async function runCase(
  extractor: EvalExtractor,
  item: RequirementDatasetCase,
  aliases: ScorerAliasMap,
): Promise<RowResult> {
  const startedAt = Date.now();
  const result = await extractor
    .extract(item.input.text)
    .catch((error: unknown): ExtractionResult => ({
      data: null,
      meta: {
        promptVersion: 0,
        usage: {
          in: 0,
          out: 0,
          cached: 0,
          client: "unknown",
          provider: "unknown",
          model: "unknown",
          ms: Date.now() - startedAt,
        },
        error: error instanceof Error ? error.message : String(error),
      },
    }));
  const actual = (result.data as ExtractedVacancyForEval | null) ?? null;
  return {
    id: item.input.id,
    title: item.input.title,
    reviewStatus: item.metadata.reviewStatus,
    score: scoreRequirements(item.expectedOutput, actual, aliases, result.meta.error),
    actual,
    usage: { ...result.meta.usage, ms: result.meta.usage.ms ?? Date.now() - startedAt },
    ...(result.meta.error ? { error: result.meta.error } : {}),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
