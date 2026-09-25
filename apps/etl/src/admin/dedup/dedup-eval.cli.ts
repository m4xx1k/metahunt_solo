/**
 * Golden-set evaluation of the dedup pair rules. Read-only.
 *
 *   node dist/admin/dedup/dedup-eval.cli.js <golden.jsonl> [--grid] [--t-title 0.6 --t-text 0.8 ...]
 *
 * Each golden line is `{ pairId, stratum, a: { id }, b: { id }, label: "same" | "different" }`.
 * Facts are loaded from the database the same way the rebuild loads them, so
 * the eval scores exactly the code path that writes positions.
 */

import "reflect-metadata";

import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import {
  containment,
  DEFAULT_THRESHOLDS,
  isSame,
  titleSim,
  vetoes,
  type MatchRule,
  type Thresholds,
  type VetoReason,
} from "../../02-enrich/dedup/match-rules";
import { matchContext } from "../../02-enrich/dedup/partition";
import {
  loadOverrides,
  loadPostings,
  type PostingRow,
} from "../../02-enrich/dedup/partition.repository";
import { describeDbTarget } from "../../platform/config/db-target";

interface GoldenPair {
  pairId: string;
  stratum: string;
  a: { id: string };
  b: { id: string };
  label: "same" | "different";
  labelConfidence?: string;
}

interface Verdict {
  pair: GoldenPair;
  predicted: boolean;
  rule: MatchRule | null;
  veto: VetoReason | null;
}

const GRID: Record<keyof Thresholds, number[]> = {
  title: [0.5, 0.6, 0.7, 0.8],
  text: [0.5, 0.6, 0.7, 0.8, 0.9],
  cosine: [0.9, 0.92, 0.94, 0.96, 1.01],
  cosineStrict: [0.93, 0.95, 0.97, 1.01],
  repostText: [0.8, 0.9],
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const file = argv[0];
  if (!file) {
    console.error(
      "Usage: dedup-eval <golden.jsonl> [--grid] [--t-title n --t-text n --t-cos n --t-cos-strict n --t-repost n]",
    );
    process.exit(2);
  }
  console.log(`target: ${describeDbTarget(process.env.DATABASE_URL).label}`);

  const golden = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldenPair);

  const partitionPath = argv.indexOf("--partition");
  if (partitionPath >= 0) {
    scorePartition(golden, argv[partitionPath + 1]);
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as DrizzleDB;
  try {
    const ids = [...new Set(golden.flatMap((p) => [p.a.id, p.b.id]))];
    const rows = new Map(
      (await loadPostings(db, ids, { embeddings: true })).map((r) => [r.facts.id, r]),
    );
    const overrides = await loadOverrides(db, ids);
    const usable = golden.filter((p) => rows.has(p.a.id) && rows.has(p.b.id));
    if (usable.length < golden.length) {
      console.log(`skipped ${golden.length - usable.length} pairs whose vacancies are gone`);
    }

    const explain = argv.indexOf("--explain");
    if (explain >= 0) {
      const wanted = new Set(argv[explain + 1].split(","));
      explainPairs(
        usable.filter((p) => wanted.has(p.pairId)),
        rows,
        overrides,
      );
      return;
    }
    if (argv.includes("--grid")) {
      grid(usable, rows, overrides);
      return;
    }
    const thresholds = {
      title: num(argv, "--t-title") ?? DEFAULT_THRESHOLDS.title,
      text: num(argv, "--t-text") ?? DEFAULT_THRESHOLDS.text,
      cosine: num(argv, "--t-cos") ?? DEFAULT_THRESHOLDS.cosine,
      cosineStrict: num(argv, "--t-cos-strict") ?? DEFAULT_THRESHOLDS.cosineStrict,
      repostText: num(argv, "--t-repost") ?? DEFAULT_THRESHOLDS.repostText,
    };
    report(evaluate(usable, rows, overrides, thresholds), thresholds);
  } finally {
    await pool.end();
  }
}

function evaluate(
  pairs: readonly GoldenPair[],
  rows: ReadonlyMap<string, PostingRow>,
  overrides: Array<[string, string]>,
  thresholds: Thresholds,
): Verdict[] {
  const embeddings = new Map<string, Float32Array>();
  for (const r of rows.values()) if (r.embedding) embeddings.set(r.facts.id, r.embedding);
  const ctx = matchContext({ overrides, embeddings, thresholds });
  return pairs.map((pair) => {
    const a = rows.get(pair.a.id)!.facts;
    const b = rows.get(pair.b.id)!.facts;
    const veto = vetoes(a, b, ctx);
    const link = veto ? null : isSame(a, b, ctx);
    return { pair, predicted: link !== null, rule: link?.rule ?? null, veto };
  });
}

function score(verdicts: readonly Verdict[]) {
  const tp = verdicts.filter((v) => v.predicted && v.pair.label === "same").length;
  const fp = verdicts.filter((v) => v.predicted && v.pair.label === "different").length;
  const fn = verdicts.filter((v) => !v.predicted && v.pair.label === "same").length;
  return {
    tp,
    fp,
    fn,
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
  };
}

function report(verdicts: Verdict[], thresholds: Thresholds): void {
  const all = score(verdicts);
  console.log(`\nthresholds ${JSON.stringify(thresholds)}`);
  console.log(`pairs=${verdicts.length} ${fmt(all)}`);

  console.log("\nper rule (precision of what the rule merged):");
  for (const rule of ["exact", "repost", "cross_source"] as const) {
    const hits = verdicts.filter((v) => v.rule === rule);
    const wrong = hits.filter((v) => v.pair.label === "different").length;
    console.log(`  ${rule.padEnd(12)} merged=${hits.length} false=${wrong}`);
  }

  console.log("\nper stratum:");
  for (const stratum of [...new Set(verdicts.map((v) => v.pair.stratum))].sort()) {
    console.log(
      `  ${stratum.padEnd(28)} ${fmt(score(verdicts.filter((v) => v.pair.stratum === stratum)))}`,
    );
  }

  const vetoCounts = new Map<string, number>();
  for (const v of verdicts.filter((x) => !x.predicted && x.pair.label === "same")) {
    const key = v.veto ?? "no_link";
    vetoCounts.set(key, (vetoCounts.get(key) ?? 0) + 1);
  }
  console.log(`\nmissed same-pairs by cause: ${JSON.stringify(Object.fromEntries(vetoCounts))}`);

  const fps = verdicts.filter((v) => v.predicted && v.pair.label === "different");
  console.log(`\nFALSE MERGES (${fps.length}):`);
  for (const v of fps) console.log(`  ${v.pair.pairId} ${v.pair.stratum} via ${v.rule}`);

  const fns = verdicts.filter((v) => !v.predicted && v.pair.label === "same");
  console.log(`\nMISSED (${fns.length}):`);
  for (const v of fns)
    console.log(
      `  ${v.pair.pairId} ${v.pair.stratum} ${v.veto ?? "no_link"} [${v.pair.labelConfidence ?? "?"}]`,
    );
}

function grid(
  pairs: readonly GoldenPair[],
  rows: ReadonlyMap<string, PostingRow>,
  overrides: Array<[string, string]>,
): void {
  const results: Array<{ t: Thresholds; s: ReturnType<typeof score> }> = [];
  for (const title of GRID.title)
    for (const text of GRID.text)
      for (const cosine of GRID.cosine)
        for (const cosineStrict of GRID.cosineStrict)
          for (const repostText of GRID.repostText) {
            const t = { title, text, cosine, cosineStrict, repostText };
            results.push({ t, s: score(evaluate(pairs, rows, overrides, t)) });
          }
  results.sort((x, y) => x.s.fp - y.s.fp || y.s.recall - x.s.recall);
  console.log("title text  cos  cosS repost | fp  fn  recall");
  for (const { t, s } of results.slice(0, 40)) {
    console.log(
      `${t.title.toFixed(2)} ${t.text.toFixed(2)} ${t.cosine.toFixed(2)} ${t.cosineStrict.toFixed(2)} ${t.repostText.toFixed(2)}  | ${String(s.fp).padStart(2)} ${String(s.fn).padStart(3)}  ${s.recall.toFixed(3)}`,
    );
  }
}

function explainPairs(
  pairs: readonly GoldenPair[],
  rows: ReadonlyMap<string, PostingRow>,
  overrides: Array<[string, string]>,
): void {
  const embeddings = new Map<string, Float32Array>();
  for (const r of rows.values()) if (r.embedding) embeddings.set(r.facts.id, r.embedding);
  const ctx = matchContext({ overrides, embeddings });
  for (const pair of pairs) {
    const a = rows.get(pair.a.id)!.facts;
    const b = rows.get(pair.b.id)!.facts;
    const days = Math.round(Math.abs(a.publishedAt - b.publishedAt) / 86_400_000);
    console.log(
      `\n${pair.pairId} ${pair.stratum} label=${pair.label}/${pair.labelConfidence ?? "?"}`,
    );
    for (const f of [a, b]) {
      console.log(
        `  [${f.sourceId.slice(0, 4)}] ${f.title} | key="${f.titleKey}" | co=${f.companyId?.slice(0, 8) ?? "null"} sen=${f.seniority} role=${f.roleNodeId?.slice(0, 8) ?? "null"} shingles=${f.shingles.length}`,
      );
    }
    console.log(
      `  titleSim=${titleSim(a.titleKey, b.titleKey).toFixed(2)} containment=${containment(a.shingles, b.shingles).toFixed(2)} cosine=${ctx.cosine(a, b)?.toFixed(3)} days=${days} veto=${vetoes(a, b, ctx)} link=${isSame(a, b, ctx)?.rule ?? null}`,
    );
  }
}

/** Cluster-level score: a pair counts as merged when both land in one group of the partition file. */
function scorePartition(golden: readonly GoldenPair[], path: string): void {
  const file = JSON.parse(readFileSync(path, "utf8")) as {
    entries: Array<{ vacancyId: string; groupId: string }>;
  };
  const groupOf = new Map(file.entries.map((e) => [e.vacancyId, e.groupId]));
  const usable = golden.filter((p) => groupOf.has(p.a.id) && groupOf.has(p.b.id));
  const verdicts: Verdict[] = usable.map((pair) => ({
    pair,
    predicted: groupOf.get(pair.a.id) === groupOf.get(pair.b.id),
    rule: null,
    veto: null,
  }));
  console.log(`partition ${path}: pairs=${verdicts.length} ${fmt(score(verdicts))}`);
  for (const stratum of [...new Set(verdicts.map((v) => v.pair.stratum))].sort()) {
    console.log(
      `  ${stratum.padEnd(28)} ${fmt(score(verdicts.filter((v) => v.pair.stratum === stratum)))}`,
    );
  }
  const fps = verdicts.filter((v) => v.predicted && v.pair.label === "different");
  console.log(`FALSE MERGES (${fps.length}): ${fps.map((v) => v.pair.pairId).join(" ")}`);
}

function fmt(s: ReturnType<typeof score>): string {
  return `tp=${s.tp} fp=${s.fp} fn=${s.fn} precision=${s.precision.toFixed(3)} recall=${s.recall.toFixed(3)}`;
}

function num(argv: string[], name: string): number | null {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : null;
}

void main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
