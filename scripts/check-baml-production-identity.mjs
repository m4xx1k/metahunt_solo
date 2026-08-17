import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["clients.baml", "extract-vacancy.baml"];
const source = await Promise.all(
  files.map(
    async (file) => `${file}\n${await readFile(resolve(root, "apps/etl/baml_src", file), "utf8")}`,
  ),
);
const actual = createHash("sha256").update(source.join("\n")).digest("hex");
const generated = await readFile(
  resolve(root, "apps/etl/src/02-enrich/extraction/baml-production-identity.generated.ts"),
  "utf8",
);
const expected = /BAML_PRODUCTION_SOURCE_HASH\s*=\s*"([a-f0-9]{64})"/.exec(generated)?.[1];
if (actual !== expected) {
  throw new Error(
    `BAML production identity is stale (expected ${actual}, generated ${expected ?? "missing"})`,
  );
}
