import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { BamlVacancyExtractor } from "../02-enrich/extraction/baml.extractor";

import { refreshAliasSnapshot } from "./dataset/aliases";
import type { EvalClient } from "./extractors/clients";
import { resolveClient } from "./extractors/clients";
import { BamlRequirementsV2Extractor } from "./extractors/requirements-v2";
import { renderRunHtml } from "./report/html";
import { renderRunMarkdown } from "./report/markdown";
import { runEval } from "./runner";
import type { EvalExtractor, EvalRun, RequirementDatasetCase } from "./types";

type OpenDatabase = () => DrizzleDB;

/** Extractors take the database opener, not a connection: only `production` calls it. */
const EXTRACTORS: Record<string, (database: OpenDatabase, client: EvalClient) => EvalExtractor> = {
  "requirements-v2": (_database, client) => new BamlRequirementsV2Extractor(client),
  // ExtractVacancy is bound to DeepSeekClient in clients.baml; --client does not reach it.
  production: (database) => new BamlVacancyExtractor(database()),
};

const REPORTS: Record<string, (run: EvalRun, cases: RequirementDatasetCase[]) => string> = {
  json: (run) => `${JSON.stringify(run, null, 2)}\n`,
  md: (run) => renderRunMarkdown(run),
  html: (run, cases) => renderRunHtml(run, cases),
};

const RUNS_DIR = join(__dirname, "runs");

async function main(): Promise<void> {
  let pool: Pool | undefined;
  const database: OpenDatabase = () => {
    pool ??= new Pool({ connectionString: required("DATABASE_URL") });
    return drizzle(pool, { schema });
  };

  try {
    if (has("--refresh-aliases")) {
      const snapshot = await refreshAliasSnapshot(database());
      console.log(
        `aliases snapshot refreshed: ${snapshot.entries.length} entries, ${snapshot.sha}`,
      );
      return;
    }

    const extractorName = flag("--extractor") ?? "requirements-v2";
    const client = resolveClient(flag("--client") ?? "DeepSeekClient");
    const { run, cases } = await runEval({
      extractor: pick(EXTRACTORS, extractorName, "--extractor")(database, client),
      extractorName,
      concurrency: numberFlag("--concurrency", 4),
      repeat: numberFlag("--repeat", 1),
      only: flag("--only"),
      onRow: (row, pass) =>
        process.stdout.write(
          `${pass} ${row.score.schemaValid ? "ok  " : "FAIL"} ${row.id.slice(0, 8)} ` +
            `f1=${row.score.requirementsF1.toFixed(2)} ${row.title.slice(0, 60)}\n`,
        ),
    });

    mkdirSync(RUNS_DIR, { recursive: true });
    // The extractor belongs in the name: both extractors run on the same client,
    // so date+client alone silently overwrites the previous run.
    const stem = `${run.startedAt.slice(0, 10)}-${run.extractor}-${run.client}`;
    for (const [extension, render] of Object.entries(REPORTS)) {
      writeFileSync(join(RUNS_DIR, `${stem}.${extension}`), render(run, cases));
    }
    console.log(
      `\n${renderRunMarkdown(run)}\nwrote eval/runs/${stem}.{${Object.keys(REPORTS).join(",")}}`,
    );
  } finally {
    await pool?.end();
  }
}

function pick<T>(table: Record<string, T>, key: string, what: string): T {
  const value = table[key];
  if (value === undefined)
    throw new Error(`unknown ${what} "${key}" — expected ${Object.keys(table).join(" | ")}`);
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this command`);
  return value;
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function numberFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
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
