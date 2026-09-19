import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";

import { BamlVacancyExtractor } from "../02-enrich/extraction/baml.extractor";
import type { ExtractionResult } from "../02-enrich/extraction/vacancy-extractor";

import { assertReleaseGate, loadAliases, loadDataset, refreshAliasSnapshot } from "./dataset";
import type { ExtractedVacancyForEval, RequirementDatasetCase } from "./extraction-eval.types";
import { scoreRequirements, summarizeRequirements } from "./extraction.scorer";
import { renderRunHtml } from "./report";
import { BamlRequirementsV2Extractor } from "./requirements-v2.baml.extractor";

type EvalExtractor = { extract(text: string): Promise<ExtractionResult> };

export type RowResult = {
  id: string;
  title: string;
  reviewStatus: RequirementDatasetCase["metadata"]["reviewStatus"];
  score: ReturnType<typeof scoreRequirements>;
  actual: ExtractedVacancyForEval | null;
  usage: ExtractionResult["meta"]["usage"];
  error?: string;
};

const RUNS_DIR = join(__dirname, "runs");

async function main(): Promise<void> {
  const extractorName = flag("--extractor") ?? "requirements-v2";
  const concurrency = Number(flag("--concurrency") ?? 4);
  const only = flag("--only");

  const pool = needsDatabase(extractorName) ? new Pool({ connectionString: databaseUrl() }) : null;
  try {
    if (has("--refresh-aliases")) {
      const refreshPool = pool ?? new Pool({ connectionString: databaseUrl() });
      const snapshot = await refreshAliasSnapshot(drizzle(refreshPool, { schema }));
      if (refreshPool !== pool) await refreshPool.end();
      console.log(
        `aliases snapshot refreshed: ${snapshot.entries.length} entries, ${snapshot.sha}`,
      );
      if (!has("--run")) return;
    }

    const extractor =
      extractorName === "production"
        ? new BamlVacancyExtractor(drizzle(pool!, { schema }))
        : new BamlRequirementsV2Extractor();
    const { aliases, sha: aliasSha } = loadAliases();
    const cases = loadDataset().filter((item) => !only || item.input.id === only);
    if (cases.length === 0) throw new Error(`no dataset rows matched ${only ?? "the filter"}`);

    const startedAt = Date.now();
    const rows = await mapWithConcurrency(cases, concurrency, async (item) => {
      const result = await runCase(extractor, item, aliases);
      process.stdout.write(
        `${result.score.schemaValid ? "ok  " : "FAIL"} ${item.input.id.slice(0, 8)} ` +
          `f1=${result.score.requirementsF1.toFixed(2)} ${item.input.title.slice(0, 60)}\n`,
      );
      return result;
    });

    const approved = rows.filter((row) => row.reviewStatus === "approved");
    if (approved.length > 0) {
      assertReleaseGate(
        approved.map((row) => row.score),
        cases,
      );
    }
    // Draft-only runs are for inspection: show their aggregate, never claim a gate.
    const summary = summarizeRequirements(
      (approved.length > 0 ? approved : rows).map((row) => row.score),
    );
    const run = {
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      extractor: extractorName,
      client: rows[0]?.usage.client ?? "unknown",
      model: rows[0]?.usage.model ?? "unknown",
      aliasSnapshotSha: aliasSha,
      gated: approved.length > 0,
      summary,
      rows,
    };

    mkdirSync(RUNS_DIR, { recursive: true });
    const stem = `${new Date(startedAt).toISOString().slice(0, 10)}-${run.client}`;
    writeFileSync(join(RUNS_DIR, `${stem}.json`), `${JSON.stringify(run, null, 2)}\n`);
    writeFileSync(join(RUNS_DIR, `${stem}.md`), renderRunMarkdown(run));
    writeFileSync(join(RUNS_DIR, `${stem}.html`), renderRunHtml(run, cases));
    console.log(`\n${renderRunMarkdown(run)}\nwrote eval/runs/${stem}.{json,md,html}`);
  } finally {
    await pool?.end();
  }
}

async function runCase(
  extractor: EvalExtractor,
  item: RequirementDatasetCase,
  aliases: Parameters<typeof scoreRequirements>[2],
): Promise<RowResult> {
  const startedAt = Date.now();
  let result: ExtractionResult;
  try {
    result = await extractor.extract(item.input.text);
  } catch (error) {
    result = {
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
    };
  }
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

function renderRunMarkdown(run: {
  extractor: string;
  client: string;
  model: string;
  aliasSnapshotSha: string;
  gated: boolean;
  durationMs: number;
  summary: ReturnType<typeof summarizeRequirements>;
  rows: RowResult[];
}): string {
  const { summary } = run;
  const tokens = run.rows.reduce(
    (total, row) => ({ in: total.in + row.usage.in, out: total.out + row.usage.out }),
    { in: 0, out: 0 },
  );
  const latencies = run.rows.map((row) => row.usage.ms ?? 0).sort((a, b) => a - b);
  const metrics: Array<[string, string]> = [
    ["schema valid", pct(summary.schemaValidRate)],
    ["provider failures", pct(summary.providerFailureRate)],
    ["precision", pct(summary.requirementsPrecision)],
    ["recall", pct(summary.requirementsRecall)],
    ["F1", pct(summary.requirementsF1)],
    ["priority accuracy", pct(summary.priorityAccuracy)],
    ["alternative accuracy", pct(summary.alternativeAccuracy)],
    ["or_split_errors", String(summary.orSplitErrors)],
    ["isTech accuracy", pct(summary.guardAccuracy.isTech)],
    ["role accuracy", pct(summary.guardAccuracy.role)],
    ["tokens in / out", `${tokens.in} / ${tokens.out}`],
    ["p50 latency", `${latencies[Math.floor(latencies.length / 2)] ?? 0} ms`],
  ];
  return [
    `### ${run.client} · ${run.model} · ${run.extractor}`,
    "",
    `${summary.evaluatedCases} rows, ${Math.round(run.durationMs / 1000)}s, aliases \`${run.aliasSnapshotSha.slice(0, 12)}\`` +
      `${run.gated ? "" : " · draft-only, no release gate"}`,
    "",
    "| metric | value |",
    "|---|---|",
    ...metrics.map(([name, value]) => `| ${name} | ${value} |`),
    "",
    // seniority is a regex over the title, identical for any model — comparing it invents a tie.
    "`seniority` is omitted: `advertisedSeniority()` is deterministic, not a model answer.",
    "",
  ].join("\n");
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function needsDatabase(extractor: string): boolean {
  return extractor === "production";
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL is required for --refresh-aliases and --extractor production");
  return url;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
