import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";

import { BamlVacancyExtractor } from "../02-enrich/extraction/baml.extractor";

import { refreshAliasSnapshot } from "./dataset/aliases";
import { BamlRequirementsV2Extractor } from "./extractors/requirements-v2";
import { renderRunHtml } from "./report/html";
import { renderRunMarkdown } from "./report/markdown";
import { runEval } from "./runner";
import type { EvalExtractor, ExtractorName, RowResult } from "./types";

const RUNS_DIR = join(__dirname, "runs");

async function main(): Promise<void> {
  const extractorName = (flag("--extractor") ?? "requirements-v2") as ExtractorName;
  if (extractorName !== "requirements-v2" && extractorName !== "production")
    throw new Error("--extractor must be requirements-v2 or production");

  const pool = extractorName === "production" || has("--refresh-aliases") ? openPool() : null;
  try {
    if (has("--refresh-aliases")) {
      const snapshot = await refreshAliasSnapshot(drizzle(pool!, { schema }));
      console.log(
        `aliases snapshot refreshed: ${snapshot.entries.length} entries, ${snapshot.sha}`,
      );
      if (!has("--run")) return;
    }

    const { run, cases } = await runEval({
      extractor: buildExtractor(extractorName, pool),
      extractorName,
      concurrency: Number(flag("--concurrency") ?? 4),
      only: flag("--only"),
      onRow: printRow,
    });

    mkdirSync(RUNS_DIR, { recursive: true });
    const stem = `${run.startedAt.slice(0, 10)}-${run.client}`;
    write(`${stem}.json`, `${JSON.stringify(run, null, 2)}\n`);
    write(`${stem}.md`, renderRunMarkdown(run));
    write(`${stem}.html`, renderRunHtml(run, cases));
    console.log(`\n${renderRunMarkdown(run)}\nwrote eval/runs/${stem}.{json,md,html}`);
  } finally {
    await pool?.end();
  }
}

function buildExtractor(name: ExtractorName, pool: Pool | null): EvalExtractor {
  return name === "production"
    ? new BamlVacancyExtractor(drizzle(pool!, { schema }))
    : new BamlRequirementsV2Extractor();
}

function printRow(row: RowResult): void {
  process.stdout.write(
    `${row.score.schemaValid ? "ok  " : "FAIL"} ${row.id.slice(0, 8)} ` +
      `f1=${row.score.requirementsF1.toFixed(2)} ${row.title.slice(0, 60)}\n`,
  );
}

function write(name: string, body: string): void {
  writeFileSync(join(RUNS_DIR, name), body);
}

function openPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_URL is required for --refresh-aliases and --extractor production");
  return new Pool({ connectionString });
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
