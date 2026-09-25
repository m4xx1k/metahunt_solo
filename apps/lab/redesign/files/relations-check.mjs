// Coverage and drift check for the curated pair labels.
//
//   pnpm --filter @metahunt/lab lab:relations
//
// Two jobs. It reports how much of the graph's strong end carries a human
// judgement, and — the part that matters over time — it fails when a label
// names a skill the taxonomy no longer has. Labels are keyed by canonical name, so
// a taxonomy merge or rename silently orphans them; without this check the
// graph quietly goes back to treating substitutes as complements.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), "../src/data");
const graph = JSON.parse(readFileSync(resolve(DATA, "graph.json"), "utf8"));
const curated = JSON.parse(readFileSync(resolve(DATA, "pair-relations.json"), "utf8"));

const TOP = Number(process.argv[2] ?? 150);
const key = (a, b) => [a, b].sort((x, y) => x.localeCompare(y)).join(" | ");

const known = new Set(graph.vocabulary);
const inGraph = new Set(graph.nodes.map((n) => n.name));
const labels = new Map(curated.pairs.map((p) => [key(...p.pair), p]));

const orphans = curated.pairs.filter((p) => p.pair.some((n) => !known.has(n)));
const belowFloor = curated.pairs.filter(
  (p) => p.pair.every((n) => known.has(n)) && p.pair.some((n) => !inGraph.has(n)),
);

const top = graph.edges.slice(0, TOP).map((e) => ({
  a: graph.nodes[e.a].name,
  b: graph.nodes[e.b].name,
  npmi: e.npmi,
}));
const unlabelled = top.filter((e) => !labels.has(key(e.a, e.b)));

const tally = {};
for (const p of curated.pairs) tally[p.relation] = (tally[p.relation] ?? 0) + 1;

console.log(`curated pairs      ${curated.pairs.length}`);
for (const [r, n] of Object.entries(tally).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${r.padEnd(17)}${String(n).padStart(3)}  ${((100 * n) / curated.pairs.length).toFixed(0)}%`);
}
console.log(`below the support floor in this cohort  ${belowFloor.length}`);
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

// Calibration: every hand label against the verdict the anyOf data reaches on
// its own. Disagreements are reported, never fatal — either side can be wrong.
const edgeByKey = new Map(
  graph.edges.map((e) => [key(graph.nodes[e.a].name, graph.nodes[e.b].name), e]),
);
const OBSERVED = ["SUBSTITUTE", "MIXED", "COMPLEMENT"];
const matrix = {};
const clashes = [];
for (const p of curated.pairs) {
  const e = edgeByKey.get(key(...p.pair));
  const col = e ? e.observed : "no edge";
  matrix[p.relation] ??= {};
  matrix[p.relation][col] = (matrix[p.relation][col] ?? 0) + 1;
  const flip =
    (p.relation === "SUBSTITUTE" && col === "COMPLEMENT") ||
    (p.relation === "COMPLEMENT" && col === "SUBSTITUTE");
  if (flip) clashes.push({ pair: p.pair, relation: p.relation, rate: e.substituteRate, pairs: e.pairs });
}
const cols = [...OBSERVED, "no edge"];
console.log(`\nhand label × observed (substitute ≥ ${graph.contract.substituteMin}, complement ≤ ${graph.contract.complementMax})`);
console.log(`  ${"".padEnd(12)}${cols.map((c) => c.padStart(12)).join("")}`);
for (const [rel, row] of Object.entries(matrix)) {
  console.log(`  ${rel.padEnd(12)}${cols.map((c) => String(row[c] ?? 0).padStart(12)).join("")}`);
}
if (clashes.length) {
  console.log(`\nopposite verdicts (${clashes.length}):`);
  for (const c of clashes) {
    console.log(`  ${c.pair.join(" / ")}  hand ${c.relation}, observed rate ${c.rate} over ${c.pairs}`);
  }
}

if (unlabelled.length) {
  console.log(`\nunlabelled in the top ${TOP}:`);
  for (const e of unlabelled) console.log(`  ${e.a} / ${e.b}  (npmi ${e.npmi.toFixed(3)})`);
}

if (orphans.length) {
  console.error(`\nDRIFT — ${orphans.length} label(s) name a skill the taxonomy no longer has:`);
  for (const p of orphans) {
    const gone = p.pair.filter((n) => !known.has(n));
    console.error(`  ${p.pair.join(" / ")}  → missing: ${gone.join(", ")}`);
  }
  console.error(`\nRe-key these against the current taxonomy before trusting the graph.`);
  process.exit(1);
}
console.log(`\nno drift — every labelled skill still exists in the taxonomy.`);
