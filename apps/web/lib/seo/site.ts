// Every absolute URL Google sees (canonical, og:url, sitemap <loc>, JSON-LD @id)
// must agree on one origin, or the pages compete for their own ranking.

/** Canonical origin. www is the real host; the apex 308-redirects here. */
export const SITE_URL = "https://www.metahunt.app";

export const SITE_NAME = "metahunt";

/** Public UI language. Ukrainian: the market searches — and the vacancy bodies are — uk. */
export const SITE_LOCALE = "uk_UA";
export const SITE_LANG = "uk";

/** Brand palette, mirrored from app/globals.css for non-CSS surfaces (manifest, OG images). */
export const BRAND_INK = "#0D0F12";
export const BRAND_ACCENT = "#FFB380";

/** Absolute URL for a site-relative path. Trailing slashes are never emitted. */
export function absoluteUrl(path = "/"): string {
  if (path === "/" || path === "") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
