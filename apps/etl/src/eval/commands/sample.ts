import { encodeText } from "../corpus-codec";
import { loadFeatures, loadTexts, withDb } from "../db";
import { paths, writeJson } from "../paths";
import { axisOf, selectSample } from "../sampling";
import type { CoverageCell, Extraction, Manifest } from "../types";

const DEFAULT_SIZE = 25;

export async function sample(argv: string[]): Promise<void> {
  const sizeArg = argv.find((a) => a.startsWith("--size="));
  const size = sizeArg ? Number(sizeArg.split("=")[1]) : DEFAULT_SIZE;
  if (!Number.isInteger(size) || size < 1) throw new Error(`bad --size: ${sizeArg}`);

  await withDb(async (client) => {
    const pool = await loadFeatures(client);
    console.log(`pool: ${pool.length} postings`);

    const { picked, cellsById, coverage, overCapPicks } = selectSample(pool, size);
    const texts = await loadTexts(
      client,
      picked.map((p) => p.id),
    );

    const manifest: Manifest = {
      generatedAt: new Date().toISOString(),
      size: picked.length,
      poolSize: pool.length,
      coverage,
      entries: picked.map((p) => ({
        id: p.id,
        source: p.source,
        category: p.category,
        title: p.title,
        link: p.link,
        publishedAt: p.publishedAt,
        cells: cellsById.get(p.id)!,
      })),
    };

    const corpus: Record<string, string> = {};
    const prod: Record<string, Extraction> = {};
    for (const p of picked) {
      const text = texts.get(p.id);
      if (!text) throw new Error(`no text for ${p.id}`);
      corpus[p.id] = encodeText(text);
      if (p.prod) prod[p.id] = p.prod;
    }

    writeJson(paths.manifest, manifest);
    writeJson(paths.corpus, corpus);
    writeJson(paths.run("prod"), prod);

    report(coverage, picked.length, overCapPicks);
  });
}

// `category` is summarised, not listed: its ~150 cells can never be covered at this
// size and printing them buries the axes whose balance says if the sample is good.
function report(coverage: CoverageCell[], size: number, overCapPicks: number): void {
  const byAxis = new Map<string, CoverageCell[]>();
  for (const c of coverage) {
    const axis = axisOf(c.cell);
    const cells = byAxis.get(axis);
    if (cells) cells.push(c);
    else byAxis.set(axis, [c]);
  }

  console.log(`\npicked ${size} postings\n`);
  for (const [axis, cells] of [...byAxis].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (axis === "category") {
      const hit = cells.filter((c) => c.picked > 0);
      console.log(
        `  category  ${hit.length} distinct: ${hit.map((c) => c.cell.slice(9)).join(", ")}`,
      );
      continue;
    }
    const parts = cells
      .map((c) => `${c.cell.slice(axis.length + 1)}=${c.picked}${c.picked >= c.cap ? "*" : ""}`)
      .join("  ");
    console.log(`  ${axis.padEnd(16)} ${parts}`);
  }
  console.log("\n  * cell is at its over-sampling cap");
  if (overCapPicks > 0) {
    console.log(`  ${overCapPicks} pick(s) had no uncapped candidate left — sample is thin`);
  }
}
