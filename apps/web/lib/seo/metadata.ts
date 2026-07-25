import type { Metadata } from "next";

import { SITE_LOCALE, SITE_NAME, absoluteUrl } from "./site";

export type PageMetaInput = {
  title: string;
  description: string;
  /** Site-relative canonical path. Query strings are never part of it. */
  path: string;
  /** Bypass the root `%s · metahunt` template (the home title carries the brand itself). */
  absoluteTitle?: boolean;
  noindex?: boolean;
  /** Share-card copy, when it should read differently from the SERP copy. */
  ogTitle?: string;
  ogDescription?: string;
};

// The one way public pages declare metadata. Canonical is not optional here:
// every duplicate-content problem this codebase had came from a page shipping
// without one, so the builder always emits it.
export function pageMetadata(input: PageMetaInput): Metadata {
  const url = absoluteUrl(input.path);
  const ogTitle = input.ogTitle ?? input.title;
  const ogDescription = input.ogDescription ?? input.description;

  return {
    title: input.absoluteTitle ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url },
    // Omitted rather than set to index:true — no robots meta is the indexable
    // default, and an explicit one would override the root config.
    ...(input.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDescription },
  };
}
