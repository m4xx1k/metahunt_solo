// Defensive coercion of already-typed `unknown` values (e.g. a jsonb bag read
// back from the DB). Unlike query-parsing, these don't parse strings or throw —
// a wrong-typed value just yields undefined / [].

export function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}
