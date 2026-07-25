# Runbook — the SEO contract

`pnpm seo:audit <base-url>` crawls a running deployment and asserts the invariants
that keep this site indexable. It exists so a regression fails in CI instead of
surfacing in Search Console three months later.

```bash
pnpm seo:audit http://localhost:4777          # a local `next start`
pnpm seo:audit https://www.metahunt.app       # production
pnpm seo:audit https://<preview>.vercel.app   # what CI does
```

## What it asserts

Per indexable route: exactly one canonical and it equals the requested URL on the
www origin; exactly one `<h1>`; `lang="uk"`; a `<title>` ≤60 chars and a
description ≤165; exactly one `og:image`; `twitter:card` is
`summary_large_image`; no unexpected `noindex`; every JSON-LD block parses and
carries the fields its `@type` requires.

Across hub and static pages: titles and descriptions are unique. **Vacancy pages
are exempt** — two near-identical postings legitimately share a headline, and
asserting otherwise would make the test cry wolf.

Sitemap: no duplicate `<loc>`, every entry on the canonical origin, and none
carrying a `?cv=` token.

Must stay out of the index: `/welcome`, and any URL with `?cv=`. Their canonical
must not leak the token either.

`robots.txt`: disallows `/dashboard`, `/me`, `/*cv=`, and advertises the sitemap.

Favicon surfaces resolve: `/favicon.ico`, `/icon.png`, `/apple-icon.png`,
`/manifest.webmanifest`.

Anti-orphan: the feed links to `/vacancy/*` pages, and those links land on 200
rather than bouncing through a redirect. A bare-uuid vacancy URL must 308.

## Why the route list is not hardcoded

It comes from the site's own `sitemap.xml`, sampled across hub and vacancy URLs. A
hardcoded list stops covering the thing it guards the moment someone adds a page.

## Where it runs

`.github/workflows/seo-audit.yml`, on `deployment_status` — the audit needs a
running app *and* a reachable API, and the `ci.yml` jobs have neither. Running it
against the Vercel deployment avoids booting web plus a database in the runner.

## Proving it can fail

An assertion nobody has seen fail is not an assertion. To re-check: delete
`alternates: { canonical: url }` from `apps/web/lib/seo/metadata.ts`, rebuild, and
the audit should report `0 canonical tags, expected 1` on every route and exit 1.
