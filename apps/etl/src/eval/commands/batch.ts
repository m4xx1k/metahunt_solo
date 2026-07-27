import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { decodeText } from "../corpus-codec";
import { loadTaxonomy, withDb } from "../db";
import { paths, readJson, writeJson } from "../paths";
import type { Manifest } from "../types";

const BATCH_SIZE = 5;
const SPEC_FILE = resolve(__dirname, "../../../baml_src/extract-vacancy.baml");

// The .baml file is the field spec, so labellers grade against the same rules
// production is meant to follow. Its `test` blocks are dropped: worked examples
// would anchor two labellers onto one reading and destroy their independence.
function loadFieldSpec(): string {
  const raw = readFileSync(SPEC_FILE, "utf8");
  const firstTest = raw.indexOf("\ntest ");
  return (firstTest === -1 ? raw : raw.slice(0, firstTest)).trim();
}

export async function batch(): Promise<void> {
  const manifest = readJson<Manifest>(paths.manifest);
  const corpus = readJson<Record<string, string>>(paths.corpus);
  const taxonomy = await withDb(loadTaxonomy);

  const spec = loadFieldSpec();
  const batches = Math.ceil(manifest.entries.length / BATCH_SIZE);

  for (let i = 0; i < batches; i += 1) {
    const slice = manifest.entries.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    writeJson(paths.batch(i + 1), {
      batch: i + 1,
      of: batches,
      spec,
      taxonomy,
      postings: slice.map((e) => ({ id: e.id, text: decodeText(corpus[e.id]) })),
    });
  }

  console.log(`wrote ${batches} batches of up to ${BATCH_SIZE} into ${paths.batchesDir}`);
}
