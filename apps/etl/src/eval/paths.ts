import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const GOLDEN_DIR = resolve(__dirname, "../../golden");

export const paths = {
  manifest: resolve(GOLDEN_DIR, "manifest.json"),
  corpus: resolve(GOLDEN_DIR, "corpus.enc.json"),
  snapshot: resolve(GOLDEN_DIR, "snapshot.json"),
  candidates: resolve(GOLDEN_DIR, "candidates.json"),
  arbitration: resolve(GOLDEN_DIR, "arbitration.json"),
  decisions: resolve(GOLDEN_DIR, "decisions.json"),
  dataset: resolve(GOLDEN_DIR, "dataset.json"),
  arbiter: resolve(GOLDEN_DIR, "labels", "arbiter.json"),
  batchesDir: resolve(GOLDEN_DIR, "batches"),
  labelsDir: resolve(GOLDEN_DIR, "labels"),
  batch: (n: number) => resolve(GOLDEN_DIR, "batches", `batch-${String(n).padStart(2, "0")}.json`),
  labels: (n: number, labeller: string) =>
    resolve(GOLDEN_DIR, "labels", `batch-${String(n).padStart(2, "0")}.${labeller}.json`),
  run: (name: string) => resolve(GOLDEN_DIR, "runs", `${name}.json`),
  runMeta: (name: string) => resolve(GOLDEN_DIR, "runs", `${name}.meta.json`),
  releasesDir: resolve(GOLDEN_DIR, "releases"),
  release: (id: string) => resolve(GOLDEN_DIR, "releases", id),
};

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
