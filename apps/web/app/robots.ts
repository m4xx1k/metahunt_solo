import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Every operator screen lives under /dashboard; /me is the account page.
        "/dashboard",
        "/me",
        // `?cv=` carries a capability token for an uploaded CV. The pages also
        // send noindex, but a shared link must not even be crawled.
        "/*cv=",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
