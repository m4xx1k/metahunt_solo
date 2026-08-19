import { existsSync } from "node:fs";

import { paths, readJson } from "../paths";
import {
  type CandidatesFile,
  type DatasetFile,
  type DecisionsFile,
  type EvaluationSnapshot,
  type LabelFile,
  type RunProvenance,
} from "../types";
import { validateRelease, validateRunProvenance } from "../validation";

function optionalRun(argv: string[]): string | undefined {
  if (argv.length === 0) return undefined;
  if (argv.length === 2 && argv[0] === "--run" && /^[a-z0-9][a-z0-9._-]*$/i.test(argv[1])) {
    return argv[1];
  }
  throw new Error("usage: golden release-check [--run <name>]");
}

/**
 * Stronger than `validate`: a release needs explainable human decisions, and a
 * scored release needs a run sidecar bound to the immutable evaluation snapshot.
 */
export async function releaseCheck(argv: string[]): Promise<void> {
  const name = optionalRun(argv);
  const required = [paths.dataset, paths.decisions, paths.candidates, paths.snapshot];
  if (name) required.push(paths.run(name), paths.runMeta(name));
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length > 0) throw new Error(`missing release artifacts: ${missing.join(", ")}`);

  const snapshot = readJson<EvaluationSnapshot>(paths.snapshot);
  const errors = validateRelease({
    dataset: readJson<DatasetFile>(paths.dataset),
    decisions: readJson<DecisionsFile>(paths.decisions),
    candidates: readJson<CandidatesFile>(paths.candidates),
    arbiter: existsSync(paths.arbiter) ? readJson<LabelFile>(paths.arbiter) : undefined,
  });
  if (name)
    errors.push(
      ...validateRunProvenance(name, readJson<RunProvenance>(paths.runMeta(name)), snapshot),
    );
  if (errors.length > 0) throw new Error(`golden release check failed:\n${errors.join("\n")}`);

  console.log(`golden release check passed${name ? ` for run ${name}` : ""}`);
}
