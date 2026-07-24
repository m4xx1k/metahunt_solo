import type { MetadataRoute } from "next";

const SITE_URL = "https://www.metahunt.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Every operator screen lives under /dashboard; /me is the account page.
      disallow: ["/dashboard", "/me"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
