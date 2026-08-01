// Minutes from `earlier` to `later`, clamped to >= 0. A negative result means
// the person id was reassigned by a merge (MET-115's problem, not ours) — we
// render null rather than a misleading negative duration. Null propagates
// when either timestamp is missing.
export function clampedMinutesBetween(
  earlier: Date | string | null,
  later: Date | string | null,
): number | null {
  if (earlier === null || later === null) return null;
  const earlierMs = toMs(earlier);
  const laterMs = toMs(later);
  const minutes = (laterMs - earlierMs) / 60_000;
  if (minutes < 0) return null;
  return Math.round(minutes);
}

function toMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
