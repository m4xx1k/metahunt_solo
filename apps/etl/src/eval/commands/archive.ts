import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { GOLDEN_DIR, paths, readJson, writeJson } from "../paths";
import { sha256 } from "../snapshot";
import type {
  CandidatesFile,
  DatasetFile,
  DecisionsFile,
  GoldenArchive,
  LabelFile,
} from "../types";
import { validateRelease } from "../validation";

type ArchiveArgs = { id: string; policyVersion: string };

function parseArgs(argv: string[]): ArchiveArgs {
  const idIndex = argv.indexOf("--id");
  const policyIndex = argv.indexOf("--policy");
  const id = idIndex === -1 ? undefined : argv[idIndex + 1];
  const policyVersion = policyIndex === -1 ? undefined : argv[policyIndex + 1];
  if (
    argv.length !== 4 ||
    idIndex === -1 ||
    policyIndex === -1 ||
    !id ||
    !policyVersion ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(id) ||
    !/^[A-Z]+-\d+$/.test(policyVersion)
  ) {
    throw new Error("usage: golden archive --id <slug> --policy <ADR-N>");
  }
  return { id, policyVersion };
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(file);
    return entry.isFile() && entry.name.endsWith(".json") ? [file] : [];
  });
}

function copyInto(source: string, destination: string, files: GoldenArchive["files"]): void {
  const rel = relative(GOLDEN_DIR, source);
  if (rel.startsWith(".."))
    throw new Error(`refusing to archive outside golden directory: ${source}`);
  const target = resolve(destination, rel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  const content = readFileSync(source);
  files[rel] = { sha256: sha256(content.toString("utf8")), bytes: statSync(source).size };
}

/**
 * A release is an append-only copy of the score inputs. The working golden/ directory
 * remains useful for the next experiment, but may never be mistaken for this snapshot.
 */
export async function archive(argv: string[]): Promise<void> {
  const { id, policyVersion } = parseArgs(argv);
  const destination = paths.release(id);
  if (existsSync(destination)) throw new Error(`golden archive already exists: ${destination}`);

  const dataset = readJson<DatasetFile>(paths.dataset);
  const errors = validateRelease({
    dataset,
    decisions: readJson<DecisionsFile>(paths.decisions),
    candidates: readJson<CandidatesFile>(paths.candidates),
    arbiter: existsSync(paths.arbiter) ? readJson<LabelFile>(paths.arbiter) : undefined,
  });
  if (errors.length > 0)
    throw new Error(`cannot archive an invalid release:\n${errors.join("\n")}`);

  mkdirSync(paths.releasesDir, { recursive: true });
  mkdirSync(destination);
  const required = [
    paths.manifest,
    paths.corpus,
    paths.snapshot,
    paths.candidates,
    paths.decisions,
    paths.dataset,
  ];
  const sources = [
    ...required,
    ...jsonFiles(paths.labelsDir),
    ...jsonFiles(resolve(paths.dataset, "..", "runs")),
  ];
  const files: GoldenArchive["files"] = {};
  for (const source of sources) copyInto(source, destination, files);

  const archive: GoldenArchive = {
    id,
    policyVersion,
    createdAt: new Date().toISOString(),
    rows: dataset.rows.length,
    files,
  };
  writeJson(resolve(destination, "release.json"), archive);
  console.log(`archived ${dataset.rows.length} reviewed rows → ${destination}`);
}
