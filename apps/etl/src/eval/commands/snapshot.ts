import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PROMPT_VERSION } from "../../02-enrich/extraction/baml.extractor";
import { loadAliases, loadTaxonomy, withDb } from "../db";
import { paths, readJson, writeJson } from "../paths";
import { sha256 } from "../snapshot";
import type { EvaluationSnapshot } from "../types";

const SPEC_FILE = resolve(__dirname, "../../../baml_src/extract-vacancy.baml");

export async function snapshot(): Promise<void> {
  const corpus = readJson<Record<string, string>>(paths.corpus);
  const { taxonomy, aliases } = await withDb(async (client) => ({
    taxonomy: await loadTaxonomy(client),
    aliases: await loadAliases(client),
  }));
  const value: EvaluationSnapshot = {
    generatedAt: new Date().toISOString(),
    corpusSha256: sha256(JSON.stringify(corpus)),
    prompt: { version: PROMPT_VERSION, sourceSha256: sha256(readFileSync(SPEC_FILE, "utf8")) },
    taxonomy,
    aliases,
  };
  writeJson(paths.snapshot, value);
  console.log(`wrote golden snapshot → ${paths.snapshot}`);
}
