import { isUuid } from "./uuid";

export type SearchParamValue = string | string[] | undefined;

export function firstSearchParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function booleanSearchParam(value: SearchParamValue): boolean {
  return firstSearchParam(value) === "true";
}

export function nonNegativeIntegerSearchParam(value: SearchParamValue, fallback = 0): number {
  const raw = firstSearchParam(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function positiveIntegerSearchParam(value: SearchParamValue, fallback: number): number {
  const parsed = nonNegativeIntegerSearchParam(value, fallback);
  return parsed >= 1 ? parsed : fallback;
}

export function uuidSearchParam(value: SearchParamValue): string | undefined {
  const raw = firstSearchParam(value);
  return raw && isUuid(raw) ? raw : undefined;
}

export function flattenSearchParams(
  params: Record<string, SearchParamValue>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, firstSearchParam(value)]),
  );
}
