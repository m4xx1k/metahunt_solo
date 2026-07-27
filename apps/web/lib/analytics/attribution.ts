import { firstSearchParam } from "@/lib/search-params";

export type AcquisitionAttribution = Partial<
  Record<
    | "utm_source"
    | "utm_medium"
    | "utm_campaign"
    | "utm_content"
    | "utm_term"
    | "creative_id"
    | "referrer_domain",
    string
  >
>;

// `referrer_domain` is not a URL parameter — it is read from document.referrer
// and joins the same first-touch blob, because it answers the same question for
// the ~1/3 of arrivals that carry no tags at all.
const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "creative_id",
  "referrer_domain",
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
 * The hostname that sent us here, or nothing. Same-host referrers are dropped:
 * internal navigation is not acquisition, and counting it would invent a
 * channel. Hostname only — a full referrer URL is PII-adjacent and answers
 * nothing extra.
 */
export function currentReferrerDomain(): AcquisitionAttribution {
  // Guard `document`, not `window`: they are not interchangeable, and reading a
  // missing one throws inside persistFirstTouch's catch, which would silently
  // stop the whole first touch from being stored.
  if (typeof document === "undefined" || !document.referrer) return {};
  try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    if (!host) return {};
    const ownHost = typeof location === "undefined" ? "" : location.hostname.toLowerCase();
    if (host === ownHost) return {};
    return SAFE_VALUE.test(host) ? { referrer_domain: host } : {};
  } catch {
    return {};
  }
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
    // The referrer joins the blob so an untagged arrival is still attributable
    // later, once internal navigation has dropped the query string.
    const attribution = {
      ...readAcquisitionAttribution(Object.fromEntries(new URLSearchParams(search))),
      ...currentReferrerDomain(),
    };
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
