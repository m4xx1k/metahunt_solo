export type ActivityTone = "fresh" | "recent" | "stale" | "never";

const DAY_MS = 86_400_000;

// How alive a subscriber looks, from their own last action. Kept out of the
// component so the `Date.now()` call isn't a render-purity violation.
export function activityTone(iso: string | null, nowMs: number = Date.now()): ActivityTone {
  if (!iso) return "never";
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "never";
  const age = nowMs - at;
  if (age < DAY_MS) return "fresh";
  if (age < 7 * DAY_MS) return "recent";
  return "stale";
}
