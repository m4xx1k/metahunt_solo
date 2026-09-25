// Mirrors the dossier's split for a few skills, straight from the artifact.
//   node apps/lab/redesign/files/dossier-check.mjs apps/lab/src/data/graph.json
import { readFileSync } from "node:fs";

const g = JSON.parse(readFileSync(process.argv[2], "utf8"));
const idx = new Map(g.nodes.map((n, i) => [n.name, i]));

function split(name) {
  const s = idx.get(name);
  const companions = [];
  const forks = [];
  for (const e of g.edges) {
    if ((e.a !== s && e.b !== s) || e.pairs < g.contract.minPairSupport) continue;
    const other = g.nodes[e.a === s ? e.b : e.a].name;
    if (e.observed === "SUBSTITUTE") forks.push(other);
    else if ((e.pairs - e.substitutePairs) / g.nodes[s].support >= 0.2) companions.push(other);
  }
  return { companions, forks };
}

const expect = [
  ["AWS", "forks", "Azure"],
  ["AWS", "forks", "Google Cloud"],
  ["AWS", "companions", "Azure", false],
  ["Docker", "companions", "Kubernetes"],
  ["Docker", "forks", "Kubernetes", false],
  ["React", "forks", "Vue.js"],
  ["React", "companions", "TypeScript"],
];
let bad = 0;
for (const [skill, list, other, present = true] of expect) {
  const got = split(skill)[list].includes(other);
  if (got !== present) bad++;
  console.log(`${got === present ? "ok  " : "FAIL"} ${skill}: ${other} ${present ? "in" : "not in"} ${list}`);
}
process.exit(bad ? 1 : 0);
