import { firstSearchParam } from "@/lib/search-params";

export type AcquisitionAttribution = Partial<
  Record<
    "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term" | "creative_id",
    string
  >
>;

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "creative_id",
] as const;
const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._~-]{0,63}$/;
const FIRST_TOUCH_KEY = "metahunt.analytics.first_touch";

export type AcquisitionSearchParams = Record<string, string | string[] | undefined>;

export function readAcquisitionAttribution(
  searchParams: AcquisitionSearchParams,
): AcquisitionAttribution {
  const attribution: AcquisitionAttribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = firstSearchParam(searchParams[key]);
    if (value && SAFE_VALUE.test(value)) attribution[key] = value;
  }
  return attribution;
}

function isEmpty(attribution: AcquisitionAttribution): boolean {
  return Object.keys(attribution).length === 0;
}

/**
 * Store the first tagged arrival for the lifetime of the browser profile.
 * First-touch: once something is stored, later tagged visits never overwrite
 * it — the question is "where did this person come from", not "last click".
 */
export function persistFirstTouch(search: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(FIRST_TOUCH_KEY)) return;
    const attribution = readAcquisitionAttribution(Object.fromEntries(new URLSearchParams(search)));
    if (isEmpty(attribution)) return;
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(attribution));
  } catch {
    // Storage may be unavailable (private mode, quota) — attribution is
    // best-effort, never worth breaking the page over.
  }
}

export function storedFirstTouch(): AcquisitionAttribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return readAcquisitionAttribution(parsed as AcquisitionSearchParams);
  } catch {
    return {};
  }
}

/**
 * Attribution for an event: the current URL's tags when present, otherwise the
 * stored first touch. Without the fallback, any internal navigation dropped the
 * query string and the journey landed in the `null` channel (the "only direct"
 * bug: Reddit → /radar → click a track → utm gone).
 */
export function resolveAttribution(current: AcquisitionAttribution): AcquisitionAttribution {
  return isEmpty(current) ? storedFirstTouch() : current;
}
