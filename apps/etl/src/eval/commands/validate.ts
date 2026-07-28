import { existsSync } from "node:fs";

import { paths, readJson } from "../paths";
import type { CandidatesFile, DatasetFile, DecisionsFile, LabelFile } from "../types";
import { validateGolden } from "../validation";

export async function validate(): Promise<void> {
  const required = [paths.dataset, paths.decisions, paths.candidates];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) throw new Error(`missing golden artifacts: ${missing.join(", ")}`);

  const errors = validateGolden({
    dataset: readJson<DatasetFile>(paths.dataset),
    decisions: readJson<DecisionsFile>(paths.decisions),
    candidates: readJson<CandidatesFile>(paths.candidates),
    arbiter: existsSync(paths.arbiter) ? readJson<LabelFile>(paths.arbiter) : undefined,
  });
  if (errors.length > 0) throw new Error(`golden validation failed:\n${errors.join("\n")}`);

  console.log("golden validation passed");
}
