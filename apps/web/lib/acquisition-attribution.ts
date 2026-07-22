import type { AcquisitionAttribution } from "@/lib/hooks/use-analytics";
import { firstSearchParam } from "@/lib/search-params";

const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "creative_id",
] as const;
const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._~-]{0,63}$/;

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
