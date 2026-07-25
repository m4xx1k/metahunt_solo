import type { MetadataRoute } from "next";

import { aggregatesApi } from "@/lib/api/aggregates";
import { facetsApi, type NodeFacet } from "@/lib/api/facets";
import { sitemapApi, type CompanyFacet } from "@/lib/api/sitemap";
import { tracksApi, type TrackDto } from "@/lib/api/tracks";
import { COMPANY_HUB_MIN_VACANCIES, ROLE_HUB_MIN_VACANCIES } from "@/lib/seo/hub-meta";
import { VACANCY_VALID_DAYS } from "@/lib/seo/job-posting";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { vacancyPath } from "@/lib/seo/vacancy-url";

// One file, deliberately. generateSitemaps() would let Search Console report
// vacancy coverage separately from hub coverage, but it also removes /sitemap.xml
// in favour of /sitemap/<id>.xml — and that URL is the one already submitted and
// advertised in robots.txt. ~5k URLs is a tenth of Google's 50k cap; split when
// the vacancy set actually approaches it.
export const revalidate = 3600;

// Every track the feed serves, from the live tree. The previous hardcoded list of
// 11 disciplines left ~30 live pages out entirely — /fullstack-react alone has
// over a thousand vacancies.
function hasSupply(track: TrackDto, all: TrackDto[]): boolean {
  return track.count > 0 || all.some((t) => t.parentSlug === track.slug && t.count > 0);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Each source degrades on its own: a backend gap should cost us that section,
  // never the whole sitemap.
  const [tracks, lastSync, vacancies, roles, companies] = await Promise.all([
    tracksApi
      .get()
      .then((r) => r.tracks)
      .catch((): TrackDto[] => []),
    aggregatesApi
      .get()
      .then((a) => a.lastSyncAt)
      .catch(() => null),
    // Fresh only, matching JobPosting's validThrough window: a URL we would mark
    // expired has no business being advertised as worth crawling.
    sitemapApi
      .vacancies(VACANCY_VALID_DAYS)
      .then((r) => r.items)
      .catch(() => []),
    facetsApi
      .roles()
      .then((r) => r.roles)
      .catch((): NodeFacet[] => []),
    sitemapApi
      .companies()
      .then((r) => r.companies)
      .catch((): CompanyFacet[] => []),
  ]);

  // A feed page's content changes on the ingest, so that is its real lastmod.
  const ingestedAt = lastSync ? new Date(lastSync) : undefined;
  const withSupply = tracks.filter((t) => hasSupply(t, tracks));

  return [
    { url: SITE_URL, lastModified: ingestedAt, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/radar"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/match"), changeFrequency: "monthly", priority: 0.8 },
    { url: absoluteUrl("/how-it-works"), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.3 },

    ...withSupply.map((t) => ({
      url: absoluteUrl(`/${t.slug}`),
      lastModified: ingestedAt,
      changeFrequency: "daily" as const,
      // Disciplines outrank their stack children.
      priority: t.parentSlug === null ? 0.9 : 0.7,
    })),

    ...withSupply
      .filter((t) => t.parentSlug === null || t.count > 0)
      .map((t) => ({
        url: absoluteUrl(`/radar/${t.slug}`),
        changeFrequency: "daily" as const,
        priority: t.parentSlug === null ? 0.8 : 0.6,
      })),

    // Hubs are listed only above their supply threshold — the same guard the
    // routes enforce, so the sitemap never advertises a page that 404s.
    ...roles
      .filter((r) => r.count >= ROLE_HUB_MIN_VACANCIES)
      .map((r) => ({
        url: absoluteUrl(`/role/${r.id}`),
        lastModified: ingestedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),

    ...companies
      .filter((c) => c.slug.trim() && c.count >= COMPANY_HUB_MIN_VACANCIES)
      .map((c) => ({
        url: absoluteUrl(`/company/${c.slug}`),
        lastModified: ingestedAt,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),

    ...vacancies.map((v) => ({
      url: absoluteUrl(vacancyPath({ id: v.id, roleName: v.roleName, title: v.title })),
      lastModified: new Date(v.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
