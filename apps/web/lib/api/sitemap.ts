// Web-side wire types + fetcher for the SEO-only feed projections.
// Source of truth: apps/etl/src/03-discovery/feed/feed.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import { apiGet, buildQs } from "./client";

export interface SitemapVacancy {
  id: string;
  title: string;
  /** Verified role name — the URL slug is built from it, so it must come from
   *  here rather than being re-derived, or the sitemap lists URLs that redirect. */
  roleName: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface SitemapResponse {
  items: SitemapVacancy[];
}

export interface CompanyFacet {
  slug: string;
  name: string;
  count: number;
}

export interface CompanyFacetsResponse {
  companies: CompanyFacet[];
}

export const sitemapApi = {
  // One request instead of ~49 paginated ones: GET /feed caps pageSize at 100.
  vacancies: (postedWithinDays: number, init?: RequestInit) =>
    apiGet<SitemapResponse>(
      `/feed/sitemap${buildQs({ postedWithinDays })}`,
      init ?? { next: { revalidate: 3600 } },
    ),

  companies: (init?: RequestInit) =>
    apiGet<CompanyFacetsResponse>("/feed/companies", init ?? { next: { revalidate: 3600 } }),
};
