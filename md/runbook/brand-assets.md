# Runbook — brand icon family

How the favicon / app-icon set is produced, and why it isn't the marketing logo.

## Why the icons are not `public/logo.webp`

`logo.webp` is a detailed puzzle-eye: dozens of thin strokes inside a circular iris. It reads at 512px and turns into speckle at 32px and below — verified by rasterising it at 16/32/48. Browser tabs and Google's SERP favicon slot are exactly that size band, so the icons use a **reduced** mark instead: the same composition (accent field, ink lens, accent pupil), with the interior detail removed.

The marketing logo stays in use wherever the render is large (header, OG images).

## Sources of truth

`apps/web/public/brand/` holds the three SVG marks the rasters are generated from:

| File | Used for |
|---|---|
| `mark-small.svg` | the 16px and 32px `favicon.ico` frames |
| `mark.svg` | the 48px frame, `icon.png`, `apple-icon.png`, manifest icons |
| `mark-maskable.svg` | the Android maskable icon (content inset to the inner 80% safe area) |

Geometry: a 48×48 viewBox, an accent (`#FFB380`) full-bleed square with **no corner radius** (the design system sets `--radius: 0`), an ink (`#0D0F12`) almond lens drawn as two symmetric quadratic arcs, and an accent pupil.

The one non-obvious parameter: a quadratic Bézier reaches only **half** its control-point offset at the apex (`(P0 + 2C + P2)/4`), so the `spread` value is roughly twice the lens half-height you actually want. Small sizes get a fatter lens and a larger pupil so they survive the downsample:

| Band | pad | spread | pupil |
|---|---|---|---|
| 16/32 | 1 | 38 | 8 |
| 48+ | 3 | 31 | 7 |
| maskable | 3 | 31 | 7 + 5px inset |

## Regenerating

The rasters are committed, so this is only needed if a mark changes. `sharp` is **not** a declared dependency — it is deliberately not added, because adding it would touch `apps/web/package.json` and `pnpm-lock.yaml` for a once-a-year asset job. Rasterise with any tool that reads SVG; the required outputs are:

- `apps/web/app/favicon.ico` — 3 frames: 16, 32 (from `mark-small.svg`), 48 (from `mark.svg`)
- `apps/web/app/icon.png` — 512
- `apps/web/app/apple-icon.png` — 180
- `apps/web/public/brand/icon-192.png`, `icon-512.png` — from `mark.svg`
- `apps/web/public/brand/icon-512-maskable.png` — from `mark-maskable.svg`

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
