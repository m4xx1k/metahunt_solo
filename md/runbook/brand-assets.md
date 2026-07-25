# Runbook — brand icon family

Every icon is the real `public/logo.webp`, round-cropped. Owner's call, made after
seeing the alternatives.

## Round, from the logo itself

The app renders the logo `rounded-full` everywhere, so the icons are circles too.

The crop is a square centred on the **ink bounding box** (x 55..968, y 212..819 of
the 1024² source), side 950 — *not* `sharp.trim()`. The logo has a light sparkle in
its bottom-right corner, so trim stops at the sparkle and its box is not centred on
the eye: the result pushed the eye upward and left an empty crescent beneath it.
Side 950 puts the 914-wide almond at ~96% of the circle's diameter.

**At 16px this is a speckled blob, and that is accepted.** The iris holds five
concentric rings of thin-stroked puzzle pieces and a tab favicon has 16 pixels — the
detail cannot survive, it is arithmetic. It resolves from ~32px, which is what
Google and Android use. Reduced marks were tried and rejected in favour of brand
consistency; see git history of this file if that trade is ever revisited.

`apple-icon.png` and the maskable icon are square and **opaque**: iOS paints
transparency black, and Android crops maskable icons to a circle itself. Everything
else keeps transparent corners so the circle shows.

## Regenerating

The rasters are committed, so this is only needed if a mark changes. `sharp` is **not** a declared dependency — it is deliberately not added, because adding it would touch `apps/web/package.json` and `pnpm-lock.yaml` for a once-a-year asset job. Every output is derived from `public/logo.webp` by the crop above; the required set is:

- `apps/web/app/favicon.ico` — 3 round frames: 16, 32, 48
- `apps/web/app/icon.png` — 512, round
- `apps/web/app/apple-icon.png` — 180, square and opaque
- `apps/web/public/brand/icon-192.png`, `icon-512.png` — round
- `apps/web/public/brand/icon-512-maskable.png` — `logo.webp` at 410px padded to 512 on an accent field (the inner-80% safe area). Note: sharp reorders `resize`/`extend` inside one pipeline, so the padding needs a second pass over the buffer or it comes out 614px.

`.ico` has no encoder in most image libraries: the container is a 6-byte header, one 16-byte directory entry per frame (width, height, 0 palette, 0 reserved, 1 plane, 32bpp, byte length, byte offset), then the PNG payloads concatenated in the same order.

## Why the manifest icons live in `public/brand/`

Next's `app/icon.*` convention serves them with a content-hash query (`/icon.png?icon.12.yotw5-2imh.png`). Google requires a favicon URL that **stays stable**, so the manifest points at unhashed `public/` paths. The hash is derived from file content, not the build, so `app/favicon.ico` is stable too — it only changes when the icon itself changes.

## Verifying

```bash
curl -sI https://www.metahunt.app/favicon.ico    # 200, image/vnd.microsoft.icon
curl -s  https://www.metahunt.app/manifest.webmanifest
curl -sI -A 'Googlebot-Image/1.0' https://www.metahunt.app/favicon.ico   # must be 200
```

Google allows "several days to several weeks" to pick a favicon up, and only fetches it from the **home page** of a hostname. A code change cannot make it appear sooner — the lever is Search Console (verify the property, submit the sitemap, request indexing for `/`).
