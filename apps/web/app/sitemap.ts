import type { MetadataRoute } from "next";

import { tracksApi } from "@/lib/api/tracks";

const SITE_URL = "https://www.metahunt.app";
const TRACKS = [
  "backend",
  "fullstack",
  "frontend",
  "data-ai",
  "qa",
  "devops",
  "mobile",
  "hardware",
  "security",
  "gamedev",
  "blockchain",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/radar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.4 },
  ];

  // Promoted radar landings: the top-level disciplines (by sortOrder, real
  // supply) plus backend's stack children — sourced from the live tracks tree,
  // never invented slugs. Tolerates a build-time API gap: falls back to the
  // static routes + legacy /<track> list rather than failing the sitemap.
  let radarRoutes: MetadataRoute.Sitemap = [];
  try {
    const { tracks } = await tracksApi.get();
    const hasSupply = (t: (typeof tracks)[number]) =>
      t.count > 0 || tracks.some((c) => c.parentSlug === t.slug && c.count > 0);
    const disciplines = tracks
      .filter((t) => t.parentSlug === null && hasSupply(t))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const backendChildren = tracks
      .filter((t) => t.parentSlug === "backend" && t.count > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    radarRoutes = [...disciplines, ...backendChildren].map((t) => ({
      url: `${SITE_URL}/radar/${t.slug}`,
      changeFrequency: "daily" as const,
      priority: t.parentSlug === null ? 0.9 : 0.7,
    }));
  } catch {
    radarRoutes = [{ url: `${SITE_URL}/radar/backend`, changeFrequency: "daily", priority: 0.9 }];
  }

  return [
    ...staticRoutes,
    ...radarRoutes,
    ...TRACKS.map((track) => ({
      url: `${SITE_URL}/${track}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
