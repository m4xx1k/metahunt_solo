// Split the raw 04-export.sql document into the three files the app fetches,
// and fold the hand-curated relation labels in against this rebuild's nodes.
//
//   node pipeline/assemble.mjs <raw-export.json> <src/data>
//
// Why three files (see md/journal/migrations/lab-constellation.md, T2):
//   core.json   eager  — nodes + contract/provenance + resolved relation labels
//   edges.json  after mount — edge tuples + node->edge adjacency index
//   roles.json  on demand   — role marginals and in-role pair counts
//
// The relation labels in src/data/pair-relations.json stay keyed by canonical
// skill NAME and hand-edited (guardrail 4). They are resolved to node ids HERE,
// at build time, against the nodes this rebuild actually produced. A curated
// name that no longer resolves is a hard error — that is what "zero orphans by
// construction" means: the runtime never sees an unresolved label.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const [, , rawPath, outDir, curatedArg] = process.argv;
if (!rawPath || !outDir) {
  console.error("usage: node pipeline/assemble.mjs <raw-export.json> <out-dir> [pair-relations.json]");
  process.exit(2);
}
const curatedPath = curatedArg
  ? resolve(curatedArg)
  : resolve(HERE, "../src/data/pair-relations.json");

const g = JSON.parse(readFileSync(rawPath, "utf8"));
const curated = JSON.parse(readFileSync(curatedPath, "utf8"));

// Same order the RelationsView legend uses; the index is what gets stored.
const RELATIONS = ["COMPLEMENT", "SUBSTITUTE", "IMPLIES", "CONTESTED"];

const nameToIdx = new Map(g.nodes.map((n, i) => [n.name, i]));

// --- resolve curated labels against this rebuild's nodes --------------------
const unresolved = [];
const relationLabels = curated.pairs.map((p) => {
  const [na, nb] = p.pair;
  const a = nameToIdx.get(na);
  const b = nameToIdx.get(nb);
  if (a === undefined) unresolved.push(na);
  if (b === undefined) unresolved.push(nb);
  const rel = RELATIONS.indexOf(p.relation);
  if (rel < 0) unresolved.push(`relation:${p.relation}`);
  // Curated order is meaningful: IMPLIES reads pair[0] -> pair[1].
  return { a, b, names: [na, nb], rel, ...(p.note ? { note: p.note } : {}) };
});

if (unresolved.length) {
  console.error(
    `assemble: ${unresolved.length} curated name(s) do not resolve against this rebuild:`,
  );
  for (const n of [...new Set(unresolved)]) console.error(`  - ${n}`);
  console.error("Re-key src/data/pair-relations.json by hand, then rebuild.");
  process.exit(1);
}

// --- fold the relation into each edge, build the adjacency index -----------
// Unordered {a,b} -> rel index, for the edge fold.
const relByPair = new Map();
for (const l of relationLabels) {
  const key = l.a < l.b ? `${l.a},${l.b}` : `${l.b},${l.a}`;
  relByPair.set(key, l.rel);
}

const adj = {};
const edges = g.edges.map((e, ei) => {
  const key = e.a < e.b ? `${e.a},${e.b}` : `${e.b},${e.a}`;
  const rel = relByPair.has(key) ? relByPair.get(key) : -1;
  (adj[e.a] ??= []).push(ei);
  (adj[e.b] ??= []).push(ei);
  return [e.a, e.b, e.pairs, e.pBgivenA, e.pAgivenB, e.lift, e.npmi, rel];
});

// --- per-node degree and an 8-companion preview ---------------------------
// top[] is the 8 neighbours with the highest P(neighbour | node), tie-broken
// by npmi then index — the same primary ordering the dossier's companion
// cards use, so T4 can preview from core.json before edges.json lands. The
// depth (8) and the sort key are provisional and belong to T4 to tune.
const nodes = g.nodes.map((n, i) => {
  const around = (adj[i] ?? []).map((ei) => {
    const e = g.edges[ei];
    const other = e.a === i ? e.b : e.a;
    const p = e.a === i ? e.pBgivenA : e.pAgivenB;
    return { other, p, npmi: e.npmi };
  });
  around.sort((x, y) => y.p - x.p || y.npmi - x.npmi || x.other - y.other);
  return {
    id: n.id,
    name: n.name,
    support: n.support,
    prevalence: n.prevalence,
    deg: around.length,
    top: around.slice(0, 8).map((x) => x.other),
  };
});

// --- write the three files ----------------------------------------------
const core = {
  contract: g.contract,
  provenance: g.provenance,
  sensitivity: g.sensitivity,
  sources: g.sources,
  relations: RELATIONS,
  relationMeta: { method: curated.method, labelledAt: curated.labelledAt, count: relationLabels.length },
  relationLabels,
  nodes,
};

// Serialise all three, check the eager budget, then write — a rejected build
// must leave the committed files untouched.
const payloads = {
  "core.json": JSON.stringify(core),
  "edges.json": JSON.stringify({ edges, adj }),
  "roles.json": JSON.stringify({ roles: g.roles }),
};

for (const [name, s] of Object.entries(payloads)) {
  console.error(`  ${name.padEnd(11)} ${(Buffer.byteLength(s) / 1024).toFixed(1).padStart(7)} KB`);
}
const coreKB = Buffer.byteLength(payloads["core.json"]) / 1024;
if (coreKB > 100) {
  console.error(`assemble: core.json is ${coreKB.toFixed(1)} KB, over the 100 KB eager budget`);
  process.exit(1);
}

for (const [name, s] of Object.entries(payloads)) writeFileSync(join(outDir, name), s);
console.error(`  ${nodes.length} nodes · ${edges.length} edges · ${g.roles.length} roles · ${relationLabels.length} labels`);
