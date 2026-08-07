import { existsSync } from "node:fs";

import { paths, readJson, writeJson } from "../paths";
import { scoreField } from "../scoring";
import {
  FIELDS,
  type CandidateField,
  type Extraction,
  type LabelCandidate,
  type LabelFile,
  type Manifest,
  type EvaluationSnapshot,
} from "../types";

const LABELLERS = ["a", "b"] as const;

function batchCount(manifest: Manifest): number {
  let n = 1;
  while (existsSync(paths.batch(n + 1))) n += 1;
  return manifest.entries.length === 0 ? 0 : n;
}

function collectLabels(batches: number, labeller: string): Map<string, Extraction> {
  const byId = new Map<string, Extraction>();
  for (let n = 1; n <= batches; n += 1) {
    const file = paths.labels(n, labeller);
    if (!existsSync(file))
      throw new Error(`missing ${file} — run the ${labeller} labeller for batch ${n}`);
    for (const label of readJson<LabelFile>(file).labels) byId.set(label.id, label.values);
  }
  return byId;
}

// One file of partial values, not per batch: contested cells are sparse and span
// batches, so making the arbiter mirror the batch layout would be busywork.
function collectArbiter(): Map<string, Extraction> {
  if (!existsSync(paths.arbiter)) return new Map();
  return new Map(readJson<LabelFile>(paths.arbiter).labels.map((l) => [l.id, l.values]));
}

export async function merge(): Promise<void> {
  const manifest = readJson<Manifest>(paths.manifest);
  const prod = readJson<Record<string, Extraction>>(paths.run("prod"));
  const aliases = readJson<EvaluationSnapshot>(paths.snapshot).aliases;

  const batches = batchCount(manifest);
  const [a, b] = LABELLERS.map((l) => collectLabels(batches, l));
  const arbiter = collectArbiter();

  const candidates: LabelCandidate[] = manifest.entries.map((entry) => {
    const av = a.get(entry.id) ?? {};
    const bv = b.get(entry.id) ?? {};
    const pv = prod[entry.id] ?? {};
    const resolved = arbiter.get(entry.id);

    const fields: Record<string, CandidateField> = {};
    for (const field of FIELDS) {
      const labellersAgree = scoreField(field, av, bv, aliases) === 1;
      const ruling = resolved && field in resolved ? (resolved[field] ?? null) : undefined;
      const value = labellersAgree ? (av[field] ?? null) : (ruling ?? null);
      const prodAgrees = scoreField(field, { [field]: value }, pv, aliases) === 1;

      fields[field] = {
        value,
        // Contested survives arbitration: the human still decides, the ruling is a
        // proposal. Only labeller agreement earns the low-attention buckets.
        verdict: !labellersAgree ? "contested" : prodAgrees ? "agreed" : "prod-differs",
        a: av[field] ?? null,
        b: bv[field] ?? null,
        prod: pv[field] ?? null,
        arbiter: ruling,
      };
    }

    return {
      id: entry.id,
      title: entry.title,
      link: entry.link,
      source: entry.source,
      fields,
    };
  });

  writeJson(paths.candidates, { generatedAt: new Date().toISOString(), candidates });
  report(candidates);
}

function report(candidates: LabelCandidate[]): void {
  const counts = { agreed: 0, "prod-differs": 0, contested: 0 };
  const contestedByField = new Map<string, number>();
  for (const c of candidates) {
    for (const [field, cell] of Object.entries(c.fields)) {
      counts[cell.verdict] += 1;
      if (cell.verdict === "contested") {
        contestedByField.set(field, (contestedByField.get(field) ?? 0) + 1);
      }
    }
  }

  const total = counts.agreed + counts["prod-differs"] + counts.contested;
  const pct = (n: number) => `${Math.round((100 * n) / total)}%`;
  console.log(`\n${candidates.length} postings, ${total} field cells\n`);
  console.log(`  agreed + prod agrees   ${counts.agreed} (${pct(counts.agreed)})  — skim only`);
  console.log(
    `  agreed, prod differs   ${counts["prod-differs"]} (${pct(counts["prod-differs"])})  — likely prod bugs`,
  );
  console.log(
    `  contested              ${counts.contested} (${pct(counts.contested)})  — needs you\n`,
  );

  const worst = [...contestedByField.entries()].sort(([, x], [, y]) => y - x).slice(0, 5);
  if (worst.length > 0) {
    console.log(`  most contested fields: ${worst.map(([f, n]) => `${f} (${n})`).join(", ")}`);
  }
}
