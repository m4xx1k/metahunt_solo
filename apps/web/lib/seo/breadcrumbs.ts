import { absoluteUrl } from "./site";

export type Crumb = { name: string; path: string };

// Breadcrumb markup lets Google replace the raw URL in the SERP with a readable
// trail, and it gives deep vacancy pages a declared route back to their hub.
export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}
