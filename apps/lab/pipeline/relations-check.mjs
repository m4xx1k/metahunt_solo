// Coverage and drift check for the curated pair labels.
//
//   pnpm --filter @metahunt/lab lab:relations
//
// Two jobs. It reports how much of the graph's strong end carries a human
// judgement, and — the part that matters over time — it fails when a label
// names a skill the graph no longer has. src/data/pair-relations.json is
// name-keyed and hand-edited; pipeline/assemble.mjs already refuses to build an
// artifact if any name fails to resolve, so a clean rebuild has zero orphans by
// construction. This check still runs so a hand-edit that lands *without* a
// rebuild — the one gap assemble cannot see — does not go unnoticed.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const core = JSON.parse(readFileSync(resolve(HERE, "../public/data/core.json"), "utf8"));
const { edges } = JSON.parse(readFileSync(resolve(HERE, "../public/data/edges.json"), "utf8"));
const curated = JSON.parse(readFileSync(resolve(HERE, "../src/data/pair-relations.json"), "utf8"));

const TOP = Number(process.argv[2] ?? 150);
const key = (a, b) => [a, b].sort((x, y) => x.localeCompare(y)).join(" | ");

const known = new Set(core.nodes.map((n) => n.name));
const labels = new Map(curated.pairs.map((p) => [key(...p.pair), p]));

const orphans = curated.pairs.filter((p) => p.pair.some((n) => !known.has(n)));

// edges.json rows are [a, b, pairs, pBgivenA, pAgivenB, lift, npmi, rel].
const top = edges.slice(0, TOP).map((e) => ({
  a: core.nodes[e[0]].name,
  b: core.nodes[e[1]].name,
  npmi: e[6],
}));
const unlabelled = top.filter((e) => !labels.has(key(e.a, e.b)));

const tally = {};
for (const p of curated.pairs) tally[p.relation] = (tally[p.relation] ?? 0) + 1;

console.log(`curated pairs      ${curated.pairs.length}`);
for (const [r, n] of Object.entries(tally).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${r.padEnd(17)}${String(n).padStart(3)}  ${((100 * n) / curated.pairs.length).toFixed(0)}%`);
}
console.log(`\ntop ${TOP} edges labelled  ${TOP - unlabelled.length}/${TOP}`);

// The headline the graph has to stop getting wrong: edges a reader would take
// as "learn both" that actually mean "learn either".
const misleading = top.filter((e) => {
  const l = labels.get(key(e.a, e.b));
  return l && (l.relation === "SUBSTITUTE" || l.relation === "CONTESTED");
});
console.log(
  `of those, ${misleading.length} would be misread as "learn both" ` +
    `(${((100 * misleading.length) / TOP).toFixed(0)}% of the graph's strongest edges)`,
);

if (unlabelled.length) {
  console.log(`\nunlabelled in the top ${TOP}:`);
  for (const e of unlabelled) console.log(`  ${e.a} / ${e.b}  (npmi ${e.npmi.toFixed(3)})`);
}

if (orphans.length) {
  console.error(`\nDRIFT — ${orphans.length} label(s) name a skill the graph no longer has:`);
  for (const p of orphans) {
    const gone = p.pair.filter((n) => !known.has(n));
    console.error(`  ${p.pair.join(" / ")}  → missing: ${gone.join(", ")}`);
  }
  console.error(`\nRe-key these against the current taxonomy before trusting the graph.`);
  process.exit(1);
}
console.log(`\nno drift — every labelled skill still exists in the graph.`);
