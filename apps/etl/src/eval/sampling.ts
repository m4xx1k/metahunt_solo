import { FIELDS, type CoverageCell, type Extraction } from "./types";

/** Feature row for one posting — everything the strata need, without the body text. */
export type FeatureRow = {
  id: string;
  source: string;
  category: string;
  title: string;
  link: string | null;
  publishedAt: string;
  len: number;
  cyrPct: number;
  hasSalaryText: boolean;
  mentionsReservation: boolean;
  testAssignmentHint: boolean;
  seniorityInTitle: boolean;
  prod: Extraction | null;
};

const LANG_EN_MAX_CYR_PCT = 5;
const LANG_MIXED_MAX_CYR_PCT = 40;
const PROD_NULLS_FEW = 4;
const PROD_NULLS_MANY = 8;
const LENGTH_PERCENTILES = [5, 25, 50, 75, 95];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Length cut points derived from the pool, so buckets stay meaningful as the corpus grows. */
export function lengthCuts(rows: FeatureRow[]): number[] {
  const sorted = rows.map((r) => r.len).sort((a, b) => a - b);
  return LENGTH_PERCENTILES.map((p) => percentile(sorted, p));
}

function lengthBucket(len: number, cuts: number[]): string {
  const idx = cuts.findIndex((cut) => len <= cut);
  return idx === -1 ? `p95+` : `p${LENGTH_PERCENTILES[idx]}`;
}

function langBucket(cyrPct: number): string {
  if (cyrPct < LANG_EN_MAX_CYR_PCT) return "en";
  return cyrPct < LANG_MIXED_MAX_CYR_PCT ? "mixed" : "cyrillic";
}

function prodNullCount(prod: Extraction | null): number {
  if (!prod) return FIELDS.length;
  return FIELDS.filter((f) => prod[f] === null || prod[f] === undefined).length;
}

// `category` is deliberately weak: Djinni tags ~150 categories and DOU almost none,
// so a category-hungry objective becomes a Djinni-hungry one (measured 23/25).
const AXIS_WEIGHT: Record<string, number> = {
  source: 4,
  lang: 2,
  len: 2,
  prod: 2,
  "prod-tech": 2,
  reservation: 2,
  "prod-nulls": 1.5,
  "multi-city": 1.5,
  "salary-text": 1,
  "seniority-title": 1,
  "test-assignment": 1,
  category: 0.4,
};

// First colon, not last: category values are free text from the feed and a colon in
// one would otherwise route the cell to a nonexistent axis and lose its weight.
export function axisOf(cell: string): string {
  return cell.slice(0, cell.indexOf(":"));
}

// One cell per axis, both sides of every boolean: emitting only a rare flag's positive
// side gives flagged rows more terms, so they always win (13/25 had the reservation flag).
export function cellsOf(row: FeatureRow, cuts: number[]): string[] {
  const prod = row.prod;
  const nulls = prodNullCount(prod);
  const locations = prod?.locations;

  return [
    `source:${row.source}`,
    `category:${row.category}`,
    `len:${lengthBucket(row.len, cuts)}`,
    `lang:${langBucket(row.cyrPct)}`,
    `salary-text:${row.hasSalaryText ? "yes" : "no"}`,
    `seniority-title:${row.seniorityInTitle ? "yes" : "no"}`,
    `reservation:${row.mentionsReservation ? "yes" : "no"}`,
    `test-assignment:${row.testAssignmentHint ? "yes" : "no"}`,
    `prod-nulls:${nulls < PROD_NULLS_FEW ? "few" : nulls < PROD_NULLS_MANY ? "some" : "many"}`,
    `prod:${!prod ? "missing" : "_error" in prod ? "error" : "ok"}`,
    // Three-way: rows written before `isTech` existed have no key, and reading that
    // absence as `true` fabricated the stratum on 20 of the first 25 picks.
    `prod-tech:${prod?.isTech === undefined ? "unknown" : String(prod.isTech)}`,
    `multi-city:${Array.isArray(locations) && locations.length > 1 ? "yes" : "no"}`,
  ];
}

// Headroom above a cell's corpus share. Balancing alone pulls every axis to 50/50,
// which for rare cells yields a set that is mostly pathology.
const OVERSAMPLE_HEADROOM = 0.12;

function capOf(poolCount: number, poolSize: number, sampleSize: number): number {
  return Math.max(1, Math.ceil(sampleSize * (poolCount / poolSize + OVERSAMPLE_HEADROOM)));
}

export type Selection = {
  picked: FeatureRow[];
  cellsById: Map<string, string[]>;
  coverage: CoverageCell[];
  /** Safety net: picks made with no uncapped candidate left. No probed pool reaches it. */
  overCapPicks: number;
};

// Codepoint order, not locale: the manifest is a committed artifact and localeCompare
// can order the same ids differently across machines.
function byId(a: FeatureRow, b: FeatureRow): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Greedy: a posting scores `axisWeight / (1 + timesUsed)` over its cells, so gaps fill
// first and covered cells decay. Ties break on id; nothing is random.
export function selectSample(
  rows: FeatureRow[],
  size: number,
  includeIds: readonly string[] = [],
): Selection {
  const cuts = lengthCuts(rows);
  const pool = [...rows].sort(byId);
  const cellsById = new Map(pool.map((r) => [r.id, cellsOf(r, cuts)]));
  const byPostingId = new Map(pool.map((r) => [r.id, r]));
  const forcedIds = [...new Set(includeIds)].sort();
  const missing = forcedIds.filter((id) => !byPostingId.has(id));
  if (missing.length > 0) throw new Error(`forced sample id(s) not in pool: ${missing.join(", ")}`);
  if (forcedIds.length > size)
    throw new Error(`forced sample has ${forcedIds.length} rows, over size ${size}`);

  const poolCounts = new Map<string, number>();
  for (const cells of cellsById.values()) {
    for (const cell of cells) poolCounts.set(cell, (poolCounts.get(cell) ?? 0) + 1);
  }

  const caps = new Map(
    [...poolCounts].map(([cell, count]) => [cell, capOf(count, pool.length, size)]),
  );

  const used = new Map<string, number>();
  const picked: FeatureRow[] = forcedIds.map((id) => byPostingId.get(id)!);
  const remaining = new Set(pool.map((r) => r.id));
  for (const row of picked) {
    remaining.delete(row.id);
    for (const cell of cellsById.get(row.id)!) used.set(cell, (used.get(cell) ?? 0) + 1);
  }
  const atCap = (cell: string) => (used.get(cell) ?? 0) >= caps.get(cell)!;
  let overCapPicks = 0;

  while (picked.length < size && remaining.size > 0) {
    let best: FeatureRow | null = null;
    let bestScore = -1;
    let bestWithinCap = false;

    for (const row of pool) {
      if (!remaining.has(row.id)) continue;
      const cells = cellsById.get(row.id)!;
      const withinCap = !cells.some(atCap);
      // A row that respects every cap always beats one that does not, whatever it
      // scores — otherwise the cap is advisory and rare cells run away with the sample.
      if (bestWithinCap && !withinCap) continue;
      const score = cells.reduce(
        (sum, cell) => sum + (AXIS_WEIGHT[axisOf(cell)] ?? 1) / (1 + (used.get(cell) ?? 0)),
        0,
      );
      if (withinCap && !bestWithinCap) {
        best = row;
        bestScore = score;
        bestWithinCap = true;
        continue;
      }
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
    }

    if (!best) break;
    if (!bestWithinCap) overCapPicks += 1;
    remaining.delete(best.id);
    picked.push(best);
    for (const cell of cellsById.get(best.id)!) used.set(cell, (used.get(cell) ?? 0) + 1);
  }

  const coverage = [...poolCounts.entries()]
    .map(([cell, count]) => ({
      cell,
      picked: used.get(cell) ?? 0,
      pool: count,
      cap: caps.get(cell)!,
    }))
    .sort((a, b) => (a.cell < b.cell ? -1 : a.cell > b.cell ? 1 : 0));

  return { picked, cellsById, coverage, overCapPicks };
}
