/**
 * SEO contract test. Crawls a running build and asserts the invariants that keep
 * this site indexable, so a regression fails here instead of surfacing in Search
 * Console three months later.
 *
 *   pnpm seo:audit http://localhost:4777
 *   pnpm seo:audit https://<vercel-preview-url>
 *
 * The route list comes from the site's own sitemap rather than a hardcoded list —
 * a hardcoded list stops covering the thing it is supposed to guard the moment
 * someone adds a page.
 */
const BASE = process.argv[2]?.replace(/\/$/, "");
const CANONICAL_ORIGIN = "https://www.metahunt.app";

if (!BASE) {
  console.error("usage: pnpm seo:audit <base-url>");
  process.exit(2);
}

/** Routes that must exist and be indexable, beyond whatever the sitemap lists. */
const ALWAYS_CHECK = ["/", "/how-it-works", "/privacy", "/radar", "/releases"];
/** Routes that must be reachable but must NOT be indexable. */
// /match is an unfinished draft; it must stay out of the index until it ships.
// `?sample=` renders a scored demo preview (MET-144, replaced the retired `?cv=`)
// — reachable and shareable, but noindex so it never competes with the base URL.
const MUST_NOINDEX = ["/welcome", "/match", "/?sample=00000000-0000-0000-0000-000000000000"];
/** How many sitemap URLs of each shape to sample. */
const SAMPLE = 12;

// Vercel's deployment protection 302s every route on a protected preview. With
// the project's bypass secret in the environment the crawl gets through; without
// it the workflow skips previews entirely rather than reporting 15 false defects.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const HEADERS: HeadersInit = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};

const failures: string[] = [];
const notes: string[] = [];
const fail = (route: string, msg: string) => failures.push(`${route}: ${msg}`);

type Head = {
  status: number;
  title: string;
  description: string;
  canonical: string[];
  robots: string[];
  h1: string[];
  lang: string;
  ogImage: string[];
  twitterCard: string;
  jsonLd: unknown[];
};

const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);

async function head(url: string): Promise<Head> {
  const res = await fetch(url, { redirect: "manual", headers: HEADERS });
  const html = res.status === 200 ? await res.text() : "";
  // Only real <script type="application/ld+json"> tags: the RSC payload embeds a
  // serialised copy of them, and counting those double-counts every block.
  const jsonLd = all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g).map((raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return { __unparseable: raw.slice(0, 80) };
    }
  });
  return {
    status: res.status,
    // <title> also appears inside inline SVGs; the document title is the first.
    title: all(html, /<title[^>]*>([^<]*)<\/title>/g)[0] ?? "",
    description: all(html, /<meta name="description" content="([^"]*)"/g)[0] ?? "",
    canonical: all(html, /<link rel="canonical" href="([^"]*)"/g),
    robots: all(html, /<meta name="robots" content="([^"]*)"/g),
    h1: all(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g).map((s) =>
      s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    ),
    lang: all(html, /<html[^>]*lang="([^"]*)"/g)[0] ?? "",
    ogImage: all(html, /<meta property="og:image" content="([^"]*)"/g),
    twitterCard: all(html, /<meta name="twitter:card" content="([^"]*)"/g)[0] ?? "",
    jsonLd,
  };
}

const REQUIRED_LD_FIELDS: Record<string, string[]> = {
  JobPosting: ["title", "description", "datePosted", "hiringOrganization"],
  BreadcrumbList: ["itemListElement"],
  Organization: ["name", "url", "logo"],
  WebSite: ["url", "name"],
};

function checkIndexable(route: string, h: Head, expectPath: string) {
  if (h.status !== 200) return fail(route, `status ${h.status}`);
  if (h.lang !== "uk") fail(route, `lang="${h.lang}", expected uk`);
  if (h.twitterCard !== "summary_large_image") fail(route, `twitter:card=${h.twitterCard}`);

  if (h.canonical.length !== 1) fail(route, `${h.canonical.length} canonical tags, expected 1`);
  const canonical = h.canonical[0];
  if (canonical && canonical !== `${CANONICAL_ORIGIN}${expectPath === "/" ? "" : expectPath}`) {
    fail(route, `canonical is ${canonical}, expected ${CANONICAL_ORIGIN}${expectPath}`);
  }
  if (canonical?.includes("sample=")) fail(route, "canonical leaks the ?sample demo token");

  if (h.h1.length !== 1) fail(route, `${h.h1.length} h1 elements, expected 1`);
  if (!h.title) fail(route, "no <title>");
  if (h.title.length > 60) fail(route, `title ${h.title.length} chars (>60 truncates in the SERP)`);
  if (!h.description) fail(route, "no meta description");
  if (h.description.length > 165) fail(route, `description ${h.description.length} chars (>165)`);
  if (h.ogImage.length !== 1) fail(route, `${h.ogImage.length} og:image tags, expected 1`);
  if (h.robots.some((r) => r.includes("noindex"))) fail(route, `unexpected noindex (${h.robots})`);

  for (const ld of h.jsonLd) {
    const node = ld as Record<string, unknown>;
    if (node.__unparseable) fail(route, `unparseable JSON-LD: ${String(node.__unparseable)}`);
    const type = String(node["@type"] ?? "");
    for (const field of REQUIRED_LD_FIELDS[type] ?? []) {
      if (!(field in node)) fail(route, `${type} JSON-LD missing required "${field}"`);
    }
  }
}

async function main() {
  // Distinguish "I could not reach the app" from "the app has SEO defects".
  // A protected Vercel preview 302s every route, which would otherwise be
  // reported as a dozen unrelated failures.
  const reachable = await fetch(`${BASE}/`, { redirect: "manual", headers: HEADERS });
  if (reachable.status !== 200) {
    console.error(
      `cannot audit ${BASE}: / returned ${reachable.status}` +
        (reachable.status >= 300 && reachable.status < 400
          ? ` -> ${reachable.headers.get("location")}\n` +
            "A protected Vercel preview does this. Set VERCEL_AUTOMATION_BYPASS_SECRET."
          : ""),
    );
    process.exit(2);
  }

  // ── the sitemap is the source of truth for what we claim is indexable ──────
  const smRes = await fetch(`${BASE}/sitemap.xml`, { headers: HEADERS });
  if (smRes.status !== 200) fail("/sitemap.xml", `status ${smRes.status}`);
  const sm = smRes.status === 200 ? await smRes.text() : "";
  const locs = all(sm, /<loc>([^<]+)<\/loc>/g);

  if (locs.length === 0) fail("/sitemap.xml", "no <loc> entries");
  const dupes = locs.length - new Set(locs).size;
  if (dupes > 0) fail("/sitemap.xml", `${dupes} duplicate <loc> entries`);
  for (const loc of locs) {
    if (!loc.startsWith(CANONICAL_ORIGIN)) fail("/sitemap.xml", `off-origin <loc>: ${loc}`);
    if (loc.includes("sample=")) fail("/sitemap.xml", `<loc> carries a ?sample token: ${loc}`);
  }
  notes.push(`sitemap: ${locs.length} URLs`);

  const vacancyLocs = locs.filter((l) => l.includes("/vacancy/"));
  const otherLocs = locs.filter((l) => !l.includes("/vacancy/"));
  const stride = (xs: string[], n: number) =>
    xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0).slice(0, n);

  const sampled = [...stride(otherLocs, SAMPLE), ...stride(vacancyLocs, SAMPLE)];
  const paths = new Set<string>([
    ...ALWAYS_CHECK,
    ...sampled.map((l) => l.replace(CANONICAL_ORIGIN, "") || "/"),
  ]);

  // ── every indexable route ────────────────────────────────────────────────
  // Uniqueness is enforced across hubs and static pages only. That is where
  // duplication is a real defect — the feed and ~54 track pages all shipped one
  // title once. Two near-identical job postings legitimately share a headline,
  // and asserting otherwise would make this test cry wolf forever.
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();

  for (const path of paths) {
    const h = await head(`${BASE}${path}`);
    checkIndexable(path, h, path);
    if (path.startsWith("/vacancy/")) continue;
    if (h.title) {
      const seen = titles.get(h.title);
      if (seen) fail(path, `duplicate <title>, shared with ${seen}`);
      else titles.set(h.title, path);
    }
    if (h.description) {
      const seen = descriptions.get(h.description);
      if (seen) fail(path, `duplicate description, shared with ${seen}`);
      else descriptions.set(h.description, path);
    }
  }
  notes.push(`checked ${paths.size} indexable routes (uniqueness on ${titles.size} hub/static)`);

  // ── routes that must stay out of the index ──────────────────────────────
  for (const path of MUST_NOINDEX) {
    const h = await head(`${BASE}${path}`);
    if (h.status !== 200) fail(path, `status ${h.status}`);
    if (!h.robots.some((r) => r.includes("noindex"))) fail(path, "expected noindex, got none");
    if (h.canonical[0]?.includes("sample=")) fail(path, "canonical leaks the ?sample token");
  }

  // ── robots.txt ───────────────────────────────────────────────────────────
  const robots = await (await fetch(`${BASE}/robots.txt`, { headers: HEADERS })).text();
  for (const rule of ["Disallow: /dashboard", "Disallow: /me"]) {
    if (!robots.includes(rule)) fail("/robots.txt", `missing "${rule}"`);
  }
  if (!robots.includes(`Sitemap: ${CANONICAL_ORIGIN}/sitemap.xml`)) {
    fail("/robots.txt", "does not advertise the sitemap");
  }

  // ── icons the SERP favicon depends on ───────────────────────────────────
  for (const asset of ["/favicon.ico", "/icon.png", "/apple-icon.png", "/manifest.webmanifest"]) {
    const res = await fetch(`${BASE}${asset}`, { headers: HEADERS });
    if (res.status !== 200) fail(asset, `status ${res.status}`);
  }

  // ── anti-orphan: vacancy pages must be reachable from the feed ───────────
  const feed = await (await fetch(`${BASE}/`, { headers: HEADERS })).text();
  const feedLinks = all(feed, /href="(\/vacancy\/[^"]+)"/g);
  if (feedLinks.length === 0) {
    fail("/", "no links to /vacancy/* — the detail pages are orphans again");
  } else {
    notes.push(`feed links to ${new Set(feedLinks).size} vacancy pages`);
    // A feed link must land on the canonical form, not bounce through a redirect.
    const probe = await fetch(`${BASE}${feedLinks[0]}`, { redirect: "manual", headers: HEADERS });
    if (probe.status !== 200) fail(feedLinks[0], `feed link returns ${probe.status}, expected 200`);
  }

  // ── the bare-uuid form must redirect, not duplicate ─────────────────────
  const anyVacancy = vacancyLocs[0]?.replace(CANONICAL_ORIGIN, "");
  const uuid = anyVacancy?.match(/([0-9a-f-]{36})$/)?.[1];
  if (uuid) {
    const res = await fetch(`${BASE}/vacancy/${uuid}`, { redirect: "manual", headers: HEADERS });
    if (res.status !== 308) fail(`/vacancy/${uuid}`, `expected 308 to the slug form, got ${res.status}`);
  }

  for (const note of notes) console.log(`  · ${note}`);
  if (failures.length === 0) {
    console.log(`\nSEO contract: PASS (${BASE})`);
    process.exit(0);
  }
  console.error(`\nSEO contract: ${failures.length} FAILURE(S)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

void main();
