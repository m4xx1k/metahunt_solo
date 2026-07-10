import { BadRequestException } from "@nestjs/common";

// Canonical request-input validators for every controller (GET query + POST
// body). Inputs are `unknown`: a Nest @Query() is `string | undefined`, a JSON
// @Body() field is `unknown` — `unknown` is the superset, so one helper serves
// both. Absent (undefined/null/blank) → undefined (= "no filter"); anything
// present-but-invalid is a client error (400). One home, one error-message
// shape — controllers stay thin and never re-roll these.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Render an unknown input for error messages without collapsing objects to "[object Object]".
const show = (raw: unknown): string => (typeof raw === "string" ? raw : JSON.stringify(raw));

// Empty/absent → undefined; a non-blank string → trimmed; anything else throws.
function asString(name: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new BadRequestException(`${name} must be a string`);
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseEnum<T extends string>(
  name: string,
  raw: unknown,
  allowed: readonly T[],
): T | undefined {
  const s = asString(name, raw);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s)) {
    throw new BadRequestException(`${name} must be one of ${allowed.join(", ")}, got "${s}"`);
  }
  return s as T;
}

// CSV of enum values (e.g. ?seniorities=MIDDLE,SENIOR) → deduped T[]. For GET
// queries that want a flat URL.
export function parseEnumCsv<T extends string>(
  name: string,
  raw: unknown,
  allowed: readonly T[],
): T[] | undefined {
  const s = asString(name, raw);
  if (s === undefined) return undefined;
  const out = [...new Set(s.split(",").map((v) => parseEnum<T>(name, v, allowed)!))];
  return out.length > 0 ? out : undefined;
}

// CSV of arbitrary non-empty strings (e.g. ?domainIds=uuid1,uuid2 or
// ?experienceYears=3,6+) → deduped trimmed list. No allow-list — for open sets
// (ids, discrete tokens) a GET query wants flat.
export function parseCsv(name: string, raw: unknown): string[] | undefined {
  const s = asString(name, raw);
  if (s === undefined) return undefined;
  const out = [
    ...new Set(
      s
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    ),
  ];
  return out.length > 0 ? out : undefined;
}

// JSON array of enum values (e.g. {"seniorities":["MIDDLE","SENIOR"]}) → deduped
// T[]. For POST bodies.
export function parseEnumArray<T extends string>(
  name: string,
  raw: unknown,
  allowed: readonly T[],
): T[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new BadRequestException(`${name} must be an array`);
  }
  const out = [...new Set(raw.map((v) => parseEnum<T>(name, v, allowed)!))];
  return out.length > 0 ? out : undefined;
}

// JSON array of non-empty strings (e.g. a CV's skill list).
export function parseStringArray(name: string, raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== "string")) {
    throw new BadRequestException(`${name} must be an array of strings`);
  }
  return (raw as string[]).map((s) => s.trim()).filter((s) => s.length > 0);
}

// string | string[] | undefined → trimmed id list. The web fetcher serialises
// arrays as repeated params (?ids=a&ids=b → string[]); a single value is a
// plain string.
export function parseIdList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseId(
  name: string,
  raw: unknown,
  opts: { required?: boolean } = {},
): string | undefined {
  const s = asString(name, raw);
  if (s === undefined && opts.required) {
    throw new BadRequestException(`${name} is required`);
  }
  return s;
}

export function parseUuid(name: string, raw: unknown): string | undefined {
  const s = asString(name, raw);
  if (s === undefined) return undefined;
  if (!UUID_RE.test(s)) {
    throw new BadRequestException(`${name} must be a UUID, got "${s}"`);
  }
  return s;
}

export function parseRequiredUuid(name: string, raw: unknown): string {
  const s = parseUuid(name, raw);
  if (s === undefined) throw new BadRequestException(`${name} is required`);
  return s;
}

export function parsePage(raw: unknown, name = "page"): number {
  if (raw === undefined || raw === null) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`${name} must be a positive integer, got "${show(raw)}"`);
  }
  return n;
}

export function parsePageSize(raw: unknown, opts: { default?: number; max?: number } = {}): number {
  const def = opts.default ?? DEFAULT_PAGE_SIZE;
  const max = opts.max ?? MAX_PAGE_SIZE;
  if (raw === undefined || raw === null) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new BadRequestException(`pageSize must be an integer in 1..${max}, got "${show(raw)}"`);
  }
  return n;
}

export function parseLimit(raw: unknown, defaultValue = 50, max = 200): number {
  if (raw === undefined || raw === null) return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new BadRequestException(`limit must be an integer in 1..${max}, got "${show(raw)}"`);
  }
  return n;
}

export function parseOffset(raw: unknown, defaultValue = 0): number {
  if (raw === undefined || raw === null) return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new BadRequestException(`offset must be a non-negative integer, got "${show(raw)}"`);
  }
  return n;
}

// A positive day count (e.g. postedWithinDays freshness window).
export function parseDays(name: string, raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`${name} must be a positive integer, got "${show(raw)}"`);
  }
  return n;
}

export function parseIso(name: string, raw: unknown): Date | undefined {
  const s = asString(name, raw);
  if (s === undefined) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`${name} must be an ISO timestamp, got "${s}"`);
  }
  return d;
}

// Accepts "true"/"false"; with `numeric`, also "1"/"0".
export function parseBool(
  name: string,
  raw: unknown,
  opts: { numeric?: boolean } = {},
): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw === true || raw === false) return raw;
  if (raw === "true" || (opts.numeric && raw === "1")) return true;
  if (raw === "false" || (opts.numeric && raw === "0")) return false;
  throw new BadRequestException(`${name} must be "true" or "false", got "${show(raw)}"`);
}
