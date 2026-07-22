import type { MetadataRoute } from "next";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/radar/backend`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.4 },
  ];
  return [
    ...staticRoutes,
    ...TRACKS.map((track) => ({
      url: `${SITE_URL}/${track}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
