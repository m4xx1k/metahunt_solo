import type { ExtractionResult } from "../02-enrich/extraction/vacancy-extractor";

import { loadAliases } from "./dataset/aliases";
import { loadDataset } from "./dataset/load";
import { assertReleaseGate } from "./scoring/release-gate";
import { scoreRequirements, summarizeRequirements } from "./scoring/scorer";
import type {
  RequirementsSummary,
  EvalExtractor,
  EvalRun,
  ExtractedVacancyForEval,
  RequirementDatasetCase,
  RowResult,
  ScorerAliasMap,
} from "./types";

export type RunOptions = {
  extractor: EvalExtractor;
  extractorName: string;
  concurrency: number;
  /** The model is not deterministic, so one pass carries a few points of noise. */
  repeat: number;
  only?: string;
  onRow?: (row: RowResult, pass: number) => void;
};

export async function runEval(
  options: RunOptions,
): Promise<{ run: EvalRun; cases: RequirementDatasetCase[] }> {
  const { aliases, sha: aliasSnapshotSha } = loadAliases();
  const cases = loadDataset().filter((item) => !options.only || item.input.id === options.only);
  if (cases.length === 0)
    throw new Error(`no dataset rows matched ${options.only ?? "the filter"}`);

  const startedAt = Date.now();
  const passes: RequirementsSummary[] = [];
  let rows: RowResult[] = [];
  for (let pass = 1; pass <= options.repeat; pass++) {
    rows = await mapWithConcurrency(cases, options.concurrency, async (item) => {
      const row = await runCase(options.extractor, item, aliases);
      options.onRow?.(row, pass);
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
    passes.push(summarizeRequirements(scored.map((row) => row.score)));
  }

  return {
    cases,
    run: {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      extractor: options.extractorName,
      client: rows[0]?.usage.client ?? "unknown",
      model: rows[0]?.usage.model ?? "unknown",
      aliasSnapshotSha,
      gated: rows.some((row) => row.reviewStatus === "approved"),
      summary: meanSummary(passes),
      passes,
      // The last pass only: the per-row view is for reading disagreements, not averaging.
      rows,
    },
  };
}

function meanSummary(passes: RequirementsSummary[]): RequirementsSummary {
  const mean = (read: (summary: RequirementsSummary) => number): number =>
    passes.reduce((total, pass) => total + read(pass), 0) / passes.length;
  return {
    evaluatedCases: passes[0].evaluatedCases,
    schemaValidRate: mean((pass) => pass.schemaValidRate),
    providerFailureRate: mean((pass) => pass.providerFailureRate),
    requirementsPrecision: mean((pass) => pass.requirementsPrecision),
    requirementsRecall: mean((pass) => pass.requirementsRecall),
    requirementsF1: mean((pass) => pass.requirementsF1),
    priorityAccuracy: mean((pass) => pass.priorityAccuracy),
    alternativeAccuracy: mean((pass) => pass.alternativeAccuracy),
    orSplitErrors: mean((pass) => pass.orSplitErrors),
    guardAccuracy: {
      isTech: mean((pass) => pass.guardAccuracy.isTech),
      role: mean((pass) => pass.guardAccuracy.role),
      seniority: mean((pass) => pass.guardAccuracy.seniority),
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
