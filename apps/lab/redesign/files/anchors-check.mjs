import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync(process.argv[2], "utf8"));
const want = [
  ["AWS", "Azure", "SUBSTITUTE"], ["PyTorch", "TensorFlow", "SUBSTITUTE"], ["Kafka", "RabbitMQ", "SUBSTITUTE"],
  ["PostgreSQL", "MySQL", "SUBSTITUTE"], ["Vue.js", "React", "SUBSTITUTE"], ["Docker", "Kubernetes", "COMPLEMENT"],
  ["TypeScript", "React", "COMPLEMENT"], ["Redis", "PostgreSQL", "COMPLEMENT"], ["Bash", "Python", "MIXED"],
];
const idx = new Map(g.nodes.map((n, i) => [n.name, i]));
let bad = 0;
for (const [a, b, rel] of want) {
  const ia = idx.get(a), ib = idx.get(b);
  const e = g.edges.find((x) => (x.a === ia && x.b === ib) || (x.a === ib && x.b === ia));
  const got = e?.observed ?? "MISSING";
  if (got !== rel) bad++;
  console.log(`${got === rel ? "ok  " : "FAIL"} ${a} / ${b}: want ${rel}, got ${got}${e ? ` (rate ${e.substituteRate}, pairs ${e.pairs})` : ""}`);
}
process.exit(bad ? 1 : 0);
