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
      ],
      // `?sample=` (the retired `?cv=`'s successor) is deliberately not disallowed:
      // its pages send noindex, and a Disallow would stop a crawler ever seeing
      // that directive. Shareable-but-unindexed is the intent.
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
