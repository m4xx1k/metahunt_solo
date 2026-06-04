import type { ExternalIdExtractor } from "../source-external-id";

// e.g. https://djinni.co/jobs/789122-some-title/  ->  "789122"
export const djinniExtractor: ExternalIdExtractor = (item) => {
  const url = item.guid ?? item.link ?? "";
  const m = url.match(/\/jobs\/(\d+)/);
  if (!m) throw new Error(`djinni: cannot derive external_id from ${url}`);
  return m[1];
};
