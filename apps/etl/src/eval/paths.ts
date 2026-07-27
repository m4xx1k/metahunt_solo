import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const GOLDEN_DIR = resolve(__dirname, "../../golden");

export const paths = {
  manifest: resolve(GOLDEN_DIR, "manifest.json"),
  corpus: resolve(GOLDEN_DIR, "corpus.enc.json"),
  run: (name: string) => resolve(GOLDEN_DIR, "runs", `${name}.json`),
};

export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
