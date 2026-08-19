/*
 * Offline baseline-vs-candidate comparison for two completed live-evaluation
 * reports. It does not read the database and cannot trigger a model call.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  compareEvaluationReports,
  evaluationReportSchema,
} from "../../02-enrich/extraction/eval/vacancy-extraction-compare";

async function main(): Promise<void> {
  const baselinePath = required("--baseline");
  const candidatePath = required("--candidate");
  const baseline = evaluationReportSchema.parse(JSON.parse(await readFile(baselinePath, "utf8")));
  const candidate = evaluationReportSchema.parse(JSON.parse(await readFile(candidatePath, "utf8")));
  const comparison = compareEvaluationReports(baseline, candidate);
  const out = resolve(value("--out") ?? `.scratch/vacancy-role-comparison-${Date.now()}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(comparison, null, 2)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify(
      {
        mode: "offline-comparison",
        out,
        baselineSpecHash: comparison.baseline.specHash,
        candidateSpecHash: comparison.candidate.specHash,
        delta: comparison.metrics.delta,
      },
      null,
      2,
    ),
  );
}

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(flag: string): string {
  const result = value(flag);
  if (!result) throw new Error(`${flag} is required`);
  return resolve(result);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
