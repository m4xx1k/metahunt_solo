import { CORE_FIELDS, FIELDS, type Extraction, type Field } from "./types";

export type Aliases = Record<string, string>;

const SALARY_PARTS = ["min", "max", "currency"] as const;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Aliases are what stop "React.js" scoring as a miss against "React". Unknown names
// fall through to their normalised form so off-taxonomy skills still compare.
function canonical(value: string, type: string, aliases: Aliases): string {
  return norm(aliases[`${type}:${norm(value)}`] ?? value);
}

function setF1(expected: string[], actual: string[]): number {
  if (expected.length === 0 && actual.length === 0) return 1;
  if (expected.length === 0 || actual.length === 0) return 0;
  const want = new Set(expected);
  const hits = new Set(actual.filter((a) => want.has(a))).size;
  if (hits === 0) return 0;
  const precision = hits / new Set(actual).size;
  const recall = hits / want.size;
  return (2 * precision * recall) / (precision + recall);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function skillList(value: unknown, key: string, aliases: Aliases): string[] {
  if (!isRecord(value)) return [];
  const list = value[key];
  if (!Array.isArray(list)) return [];
  return list
    .filter((s): s is string => typeof s === "string")
    .map((s) => canonical(s, "SKILL", aliases));
}

// No alias table for places — node_type is ROLE/SKILL/DOMAIN only — so cities and
// countries compare on their normalised spelling.
function locationList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((loc) => {
    const city = typeof loc.city === "string" ? norm(loc.city) : "";
    const country = typeof loc.country === "string" ? norm(loc.country) : "";
    return `${city}|${country}`;
  });
}

// An all-null salary object is how a template-filling labeller writes "no salary
// stated"; treating it as different from null would score two spellings of the same
// answer as a total miss.
function emptySalary(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return isRecord(value) && SALARY_PARTS.every((part) => (value[part] ?? null) === null);
}

// Numbers and their string spellings must compare equal: labellers hand-write this
// JSON, so `"5000"` and `5000` are the same answer.
function salaryPart(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? norm(value) : JSON.stringify(value);
}

function salaryScore(expected: unknown, actual: unknown): number {
  if (emptySalary(expected) || emptySalary(actual)) {
    return emptySalary(expected) && emptySalary(actual) ? 1 : 0;
  }
  if (!isRecord(expected) || !isRecord(actual)) return 0;
  const hits = SALARY_PARTS.filter(
    (part) => salaryPart(expected[part]) === salaryPart(actual[part]),
  );
  return hits.length / SALARY_PARTS.length;
}

/**
 * Score in [0,1] for one field. Absent and null are the same answer — a row written
 * before a field existed did not get it wrong, it just has no value there.
 */
export function scoreField(
  field: Field,
  expected: Extraction,
  actual: Extraction,
  aliases: Aliases,
): number {
  const want = expected[field] ?? null;
  const got = actual[field] ?? null;

  if (field === "skills") {
    // Weighted by how much each list actually says. Averaging the two halves gave a
    // free 1 for the usually-empty `optional`, flooring every skills score at 0.5.
    const halves = (["required", "optional"] as const).map((key) => {
      const expectedList = skillList(want, key, aliases);
      const actualList = skillList(got, key, aliases);
      const weight = Math.max(new Set(expectedList).size, new Set(actualList).size);
      return { score: setF1(expectedList, actualList), weight };
    });
    const total = halves.reduce((sum, h) => sum + h.weight, 0);
    if (total === 0) return 1;
    return halves.reduce((sum, h) => sum + h.score * h.weight, 0) / total;
  }
  if (field === "locations") return setF1(locationList(want), locationList(got));
  if (field === "salary") return salaryScore(want, got);

  if (want === null || got === null) return want === got ? 1 : 0;
  if (typeof want === "string" && typeof got === "string") {
    const type = field === "role" ? "ROLE" : field === "domain" ? "DOMAIN" : "";
    return canonical(want, type, aliases) === canonical(got, type, aliases) ? 1 : 0;
  }
  return want === got ? 1 : 0;
}

export type ScoreReport = {
  postings: number;
  /** Golden rows the run produced nothing for — scored 0, counted here so it is visible. */
  missing: number;
  /** Golden rows whose extraction returned an error — scored 0, not null-matched. */
  failures: number;
  failureRate: number;
  core: number;
  all: number;
  byField: { field: Field; score: number }[];
  perPosting: { id: string; core: number; all: number; scores: Record<string, number> }[];
};

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

export function scoreRun(
  golden: { id: string; values: Extraction }[],
  run: Record<string, Extraction>,
  aliases: Aliases,
): ScoreReport {
  const perPosting = golden.map((row) => {
    // Missing output or recorded errors score zero; otherwise errors null-match
    // absent golden fields and look like partial successes.
    const actual = run[row.id];
    const unavailable = !actual || actual._error !== undefined;
    const scores: Record<string, number> = {};
    for (const field of FIELDS) {
      scores[field] = unavailable ? 0 : scoreField(field, row.values, actual, aliases);
    }
    return {
      id: row.id,
      core: mean(CORE_FIELDS.map((f) => scores[f])),
      all: mean(FIELDS.map((f) => scores[f])),
      scores,
    };
  });
  const failures = golden.filter((row) => run[row.id]?._error !== undefined).length;

  return {
    postings: golden.length,
    missing: golden.filter((row) => !run[row.id]).length,
    failures,
    failureRate: golden.length === 0 ? 0 : failures / golden.length,
    core: mean(perPosting.map((p) => p.core)),
    all: mean(perPosting.map((p) => p.all)),
    byField: FIELDS.map((field) => ({
      field,
      score: mean(perPosting.map((p) => p.scores[field])),
    })),
    perPosting,
  };
}
