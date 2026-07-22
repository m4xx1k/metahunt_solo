import type { MetadataRoute } from "next";

const SITE_URL = "https://www.metahunt.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/me", "/sources", "/taxonomy", "/unique-vacancies", "/vacancies"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
