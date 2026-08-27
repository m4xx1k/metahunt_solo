# apps/lab light theme never renders (Tailwind v4 `@theme` in `@media`)

**Found:** 2026-08-27, during the `feat/lab-constellation` T5 side-by-side.
**Scope:** pre-existing on `main` — `apps/lab/src/index.css` is byte-identical
across the branch. Not caused by the constellation rebuild.

## What's wrong

`apps/lab/src/index.css` defines the dark palette as a nested `@theme` block:

```css
@theme { --color-ground: #fcfcfb; /* light */ }

@media (prefers-color-scheme: dark) {
  @theme { --color-ground: #141514; /* dark */ }
}
```

Tailwind v4 collects every `@theme` globally and does **not** honour one nested
inside `@media`. The built CSS emits only one set of `--color-*` values — the
dark ones, unconditionally. `#fcfcfb` and the rest of the light palette are
absent from `dist/assets/*.css`. The lab renders dark for everyone regardless of
`prefers-color-scheme`.

Reproduce: `pnpm --filter @metahunt/lab lab:build`, then
`grep -c fcfcfb dist/assets/*.css` → `0`.

## Fix

Keep the light values in the single top-level `@theme`; inside the media query
override the **raw** custom properties, not via `@theme`:

```css
@theme {
  --color-ground: #fcfcfb;
  /* …the rest of the light palette… */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-ground: #141514;
    /* …the rest of the dark palette… */
  }
}
```

Then re-check contrast and the signal/trap separation on the light surface (the
palette comment in `index.css` says both were validated once), and re-check the
constellation's Louvain cluster tint — it already swaps lightness on
`prefers-color-scheme: dark` (`hsl(h 52% 52%)` light / `63%` dark) but has only
ever been seen dark.
