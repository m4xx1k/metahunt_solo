import { existsSync } from "node:fs";

import { paths, readJson } from "../paths";
import { scoreRun, type ScoreReport } from "../scoring";
import type { DatasetFile, EvaluationSnapshot, Extraction } from "../types";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function runName(argv: string[]): string {
  if (argv.length === 0) return "prod";
  if (argv.length === 1 && argv[0].startsWith("--run=")) {
    const value = argv[0].slice("--run=".length);
    if (/^[a-z0-9][a-z0-9._-]*$/i.test(value)) return value;
  }
  if (argv.length === 2 && argv[0] === "--run" && /^[a-z0-9][a-z0-9._-]*$/i.test(argv[1])) {
    return argv[1];
  }
  throw new Error("usage: golden score [--run <name>]");
}

function printReport(name: string, report: ScoreReport): void {
  console.log(`golden score — ${name} (historical: run has no prompt/model provenance)`);
  console.log(
    `postings ${report.postings}  core ${percent(report.core)}  all ${percent(report.all)}  missing ${report.missing}  failures ${report.failures} (${percent(report.failureRate)})`,
  );
  console.log("\nby field");
  for (const { field, score } of report.byField)
    console.log(`  ${field.padEnd(20)} ${percent(score)}`);
}

/** Scores an existing local run only; this command never calls an extractor or the database. */
export async function score(argv: string[]): Promise<void> {
  const name = runName(argv);
  const runFile = paths.run(name);
  const required = [paths.dataset, paths.snapshot, runFile];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) throw new Error(`missing scoring artifacts: ${missing.join(", ")}`);

  const dataset = readJson<DatasetFile>(paths.dataset);
  const snapshot = readJson<EvaluationSnapshot>(paths.snapshot);
  const run = readJson<Record<string, Extraction>>(runFile);
  printReport(name, scoreRun(dataset.rows, run, snapshot.aliases));
}
