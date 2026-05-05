import type { ExternalIdExtractor } from "../source-external-id";

// e.g. https://jobs.dou.ua/companies/acme/vacancies/356789/  ->  "356789"
export const douExtractor: ExternalIdExtractor = (item) => {
  const url = item.guid ?? item.link ?? "";
  const m = url.match(/\/vacancies\/(\d+)/);
  if (!m) throw new Error(`dou: cannot derive external_id from ${url}`);
  return m[1];
};
