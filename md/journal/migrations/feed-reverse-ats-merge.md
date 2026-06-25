# Migration — merge feed + reverse-ATS into one page

**Branch:** `experiment/feed-reverse-ats-merge` (off `feat/cv-skill-recommendations`).
**Status:** EXPLORATION. Prototypes + screenshots only, no app code changed,
nothing committed/pushed. Pick a direction before implementing.

## Why

`app/(feed)/[[...slug]]/page.tsx` (browse the list by tracks/filters) and
`app/reverse-ats/page.tsx` (rank the same list by your CV) are two routes over
**one vacancy list under two lenses**. They should be one page where uploading a
CV flips the lens in place — better mobile UX, one funnel, no route split.

## Where the work lives

All exploration is in `.scratch/feed-merge/` (gitignored):

- `README.md` — full write-up: the lens model, 3 variants compared, the
  recommendation, the component-mapping implementation plan, open questions.
- `variant-{a,b,c}.html` — interactive prototypes (`?state=warm`, `?sheet=filters`).
- `shots/` — screenshots, `<variant>-<state>-<viewport>.png`, 3 viewports.
- `shoot.mjs` — Playwright screenshot driver (`node shoot.mjs`).

## TL;DR of the three variants

- **A** — bottom tab bar + lens context bar + iOS bottom sheets (most app-like).
- **B** — segmented control `[усі | під моє CV]` + insights carousel (clearest model).
- **C** ★ — funnel hero that collapses into a sticky profile strip + learn ribbon
  (best conversion, most compact warm state; matches the "tracks move aside,
  resume info + recommendations take over" ask).

**Recommended:** C skeleton + B's segmented control for return users + A's
bottom-sheet filters on mobile. See `.scratch/feed-merge/README.md` →
"How this maps to real components" for the build plan.

## Next session

Decide the base variant + answer the 5 open questions in the scratch README,
then implement: new `features/feed-lens/` state machine (reuses the existing
`ReverseAtsClient.run()` fetch path), card swap `VacancyCard`⇄`MatchCard` by
lens, retire the `/reverse-ats` route.
