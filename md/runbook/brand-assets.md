# Runbook — brand icon family

How the favicon / app-icon set is produced, and why it isn't the marketing logo.

## Round, and split by size band

Every icon is a **circle** — the app already renders the logo `rounded-full`, so a square tab icon read as wrong.

`logo.webp` is a detailed puzzle-eye: dozens of thin strokes inside a circular iris. Rasterise it at 16px and you get brown speckle; at 32px it is still mud. That is arithmetic, not craft — there are five concentric rings with thin separators and only 16 pixels to put them in. So the family splits:

| Size | What it is |
|---|---|
| 16 | reduced mark, **no** iris ring — the ring-to-pupil gap lands under one physical pixel and merges into a blob |
| 32, 48 | reduced mark **with** the iris ring (the logo's own structural cue, and the only one that survives) |
| 128+ (`icon.png`, manifest 192/512) | the **real logo**, round-cropped — the puzzle detail resolves from here up, which is the band Google and Android pull from |

Things that were tried and rejected, so they don't get tried again: a ring of chunky notches around the iris (reads as gear teeth), four radial spokes (reads as a compass, the eye disappears), and the round-cropped logo at 16/32 (mud).

`apple-icon.png` and the maskable icon are deliberately **square and opaque**: iOS renders transparency as black, and Android crops maskable icons to a circle itself. Everything else keeps its transparent corners so the circle shows.

## Sources of truth

`apps/web/public/brand/` holds the three SVG marks the rasters are generated from:

| File | Used for |
|---|---|
| `mark-16.svg` | the 16px `favicon.ico` frame (no iris ring) |
| `mark-32.svg` | the 32px frame |
| `mark.svg` | the 48px frame |

Geometry: a 48×48 viewBox, an accent (`#FFB380`) **circle** filling the box, an ink (`#0D0F12`) almond lens drawn as two symmetric quadratic arcs, an accent iris ring, and an accent pupil.

The one non-obvious parameter: a quadratic Bézier reaches only **half** its control-point offset at the apex (`(P0 + 2C + P2)/4`), so the `spread` value is roughly twice the lens half-height you actually want. Small sizes get a fatter lens and a larger pupil so they survive the downsample:

| Band | pad | spread | pupil | ring r / width |
|---|---|---|---|---|
| 16 | 1 | 38 | 8 | — (dropped) |
| 32 | 2 | 35 | 6.2 | 12.4 / 2.8 |
| 48 | 3 | 32 | 6 | 12.8 / 2.4 |

## Regenerating

The rasters are committed, so this is only needed if a mark changes. `sharp` is **not** a declared dependency — it is deliberately not added, because adding it would touch `apps/web/package.json` and `pnpm-lock.yaml` for a once-a-year asset job. Rasterise with any tool that reads SVG; the required outputs are:

- `apps/web/app/favicon.ico` — 3 frames from `mark-16.svg`, `mark-32.svg`, `mark.svg`
- `apps/web/app/icon.png` — 512, `logo.webp` round-cropped
- `apps/web/app/apple-icon.png` — 180, `logo.webp` square and opaque
- `apps/web/public/brand/icon-192.png`, `icon-512.png` — `logo.webp` round-cropped
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
