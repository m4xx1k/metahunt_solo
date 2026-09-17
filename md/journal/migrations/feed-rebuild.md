# feed rebuild — one page, one filter

**Status:** in progress — tasks 3–5 partly shipped on `feat/feed-homepage`
(16 commits). Tasks 1 and 2 not started. See §Where this stands.
**Date:** 2026-09-16, updated 2026-09-17
**Sits atop:** the `(feed)` catch-all route (`/` + ~40 track slugs), MET-159
(partially superseded — see §Disposition), MET-50, MET-149.

## The idea in one line

The page holds exactly one object — **a filter** — and every component is a
different way to touch it. Nothing else is on this page.

| Component | Its only job with the filter |
|---|---|
| track | seed it (a named public preset with its own URL) |
| filter rail | edit it by hand |
| CV | rank and explain the result — never narrow it |
| subscription | persist it to Telegram |
| list | show what it returns |

Reading order follows from that: **seed → refine → (rank) → persist**. The
current page has the pieces but not the order, which is why a first-time
visitor cannot tell what to do.

## What actually makes it feel heavy

Concrete, verified — not impressions:

- **Two different pages.** `/` mounts `TrackPicker`, `/<track>` mounts
  `TrackIntro` — different components, so the pages don't look related.
- **Three container widths.** `FeedHero` and `TrackIntro` sit in `max-w-7xl`
  (1280px) with `md:px-12`; `TrackPicker` and the feed sit in
  `max-w-[1536px]` with `lg:px-12`. That is the "hero is narrower" gap.
- **A track costs two clicks.** Tile selection is local state in
  `TrackPicker`; opening the filtered feed needs a second click.
- **Twenty asks for one thing.** `VacancyMatchCard` renders `fit · locked` /
  `add your CV to see the fit` on every card without a viewer.
- **The rate lies.** `postedWithinDays` rides into `SubscriptionParams`
  (`feed-query.ts:122`), but a digest delivers *future* vacancies — a 7-day vs
  30-day window cannot change that. So a count that swings 4x on the freshness
  toggle describes nothing real.
- **Mixed labels.** `Get alerts on Telegram` beside `Обери свій напрям`
  beside `freshness` / `seniority`. Two languages, three cases, no shape.

## Working method

Layout work happens on a **parallel route copied from the feed**, changed a bit
at a time, and swapped in one move at the end. Tasks 1 and 2 are cross-cutting
and land on the live app directly — they are not layout.

## Tasks — smallest first

### 1. One label convention, applied

The smallest task and the one that makes everything after it look finished.
Today a mobile control row would read `[фільтри] [CV]`: two languages, two
cases, two lengths.

- Write the rule into `md/engineering/STYLE.md`: user-facing chrome is
  **Ukrainian**, one case per class of thing, and **no internal vocabulary on
  screen** — `track`, `lens`, `facet`, `preset`, `cold`/`warm`, `fit tier` are
  code words, not UI words.
- Labels in the same row share a language, a case and a length class:
  `[фільтри] [резюме]`, never `[фільтри] [CV]`.
- Apply across the feed surface: section titles (`freshness` → `свіжість`,
  `seniority` → `рівень`), `SubscribeButton`, `CvDropzone`, the privacy print.
- **Done when** no English string renders in the feed chrome and no code word
  is visible to a user.

### 2. Store raw CV text again

A reversal of an approved policy, so it is a decision record, not a copy edit.
`md/runbook/cv-privacy.md` currently states raw text is processed in memory and
not persisted, and new uploads write an **empty string** into
`candidates.source_text`.

- New ADR superseding that clause (never edit the accepted one). Reason: the
  profile model needs the document to re-parse without a re-upload, and the
  cv-builder cannot exist without it.
- Write `source_text` on upload again; state the retention window.
- Update `/privacy#cv`, the privacy print on the upload control, and the
  runbook's Approved policy section.
- Deletion already cascades (`account-deletion.md`) — verify, don't rebuild.
- **Done when** a new upload persists its text, and every place that claims
  otherwise has been corrected.

### 3. Parallel page, one container

- Copy the `(feed)` route to its own path (proposed `/next`), **noindex** — a
  second indexable copy of the homepage would compete with `/` in search, the
  same reason `/match` is noindexed.
- One shared container: a single max-width and gutter for hero, track strip and
  feed, so nothing is narrower than anything else.
- This route is also where the design work in §Design direction happens.
- **Done when** `/next` renders the current feed at one consistent width and is
  absent from the sitemap and robots-visible index.

### 4. One track strip, opening straight into the feed

- Replace `TrackPicker` + `TrackIntro` with **one component, two states**:
  index (nothing chosen) and track (this one active, its children beside it).
- A tile click navigates straight to `/<track>` — no local selection step. Tile
  counts carry the comparison that the intermediate panel was there to provide.
- Same markup on both pages, so the track page stops looking like a different
  site.
- **Done when** one component serves both states and a track is one click away.

### 5. Three-column shell — the actual rebuild

The largest task; everything above is groundwork.

```
Header
Hero                      ← one width with everything else
Track strip               ← task 4
──────────────────────────────────────────────────
підписка   │  N вакансій · свіжі | збіг  │  резюме
(пресет)   │  ───────────────────────     │  [ вибір ]
           │  картка                      │  [+ нове ]
фільтри    │  картка                      │
```

- **Three columns always**, including with no CV. A stable grid beats a saved
  column: nothing reflows when a CV appears, and the CV control is visible
  without a banner.
- **Right column = the only place we ask for a CV.** Logged in: a select of the
  owner's CVs with "завантажити нове" underneath it. Logged out or empty:
  sample profiles plus a soft upload. Never a modal, never a gate.
- **Remove the per-card lock.** `fit · locked` / `add your CV to see the fit`
  disappears; cards simply carry no fit block without a viewer.
- **Split count from rate.** The result count moves into the list header beside
  the sort control, set large — it legitimately follows the freshness window.
  The subscription keeps only a forward-looking rate computed over a **fixed
  30-day window**, independent of the freshness filter.
- **Delete `ActionBand`** (MET-159) — the right column does its job better.
- **Mobile:** hero short, track strip a horizontal tile scroll, then a sticky
  row `N вакансій · [фільтри] · [резюме]` opening sheets. No fixed bars.
- **Done when** all four audiences (new/returning × CV/no CV) get a coherent
  screen on both widths, and the swap of `/next` over `/` is a route rename.

## Design direction — lighter, not louder

Kept short on purpose; this is a direction, not a spec.

- **One number on the page.** Today the hero counter (6xl) and any result count
  compete. Let the hero number *become* the filtered count as the filter
  narrows — one giant figure that reacts is both simpler and the closest thing
  here to a wow moment.
- **Three filter sections open, the rest behind one control.** Роль, скіли,
  рівень carry nearly every real query; ten collapsed headers read as work.
- **Let the card breathe.** Headline, company, three facts, skills. The eyebrow
  row and the side column are where the density comes from.
- **Show the consequence before the click.** Hovering a skill chip can preview
  what the count becomes — this is the cheapest "it's alive" signal on the page
  and it also stops people building an empty filter.

## Disposition of MET-159

One unpushed commit on `feat/met-159-feed-action-band`.

- **Keep:** the deletion of `ColdRecsTeaser`, the dead bottom padding, and the
  fixed mobile upload bar — none survive into this plan either.
- **Drop:** `ActionBand` entirely (task 5).
- **Rebase:** `SubscribeBlock` — right instinct, wrong denominator (task 5).

## Open

- One item from the 2026-09-16 conversation never arrived: a pasted block meant
  to replace the privacy line on the upload control. Task 2 rewrites that line
  anyway; if the intended wording exists, it lands there.

---

## Audit — what the home page holds (2026-09-17)

Counted on the heaviest view (signed in, CV active, xl). **~25 blocks, 13 of
them filter sections.**

| Zone | Blocks |
|---|---|
| chrome | header, footer |
| hero | headline + subtitle, 6xl counter, "як це працює" link |
| seed | track strip (11 tiles) |
| refine | subscribe card, saved-alerts list, active-filters bar, роль, скіли, рівень, формат, англійська, зайнятість, домен, досвід, min fit, джерело, skill-scope, dedupe |
| results | list controls (fresh/sort/off-stack/count), 20 cards, pager |
| rank | CV card, candidate profile, skill recommendations, save-CV nudge |
| sell | HowItWorks (3 stages + a CV CTA) |

### Already closed

- Two subscribe controls in two columns → one `SubscribeCard`, and it now knows
  what the account already has instead of offering a duplicate.
- Three CV asks (full-width stripe, teaser, HowItWorks CTA) → the stripe is
  gone; the CV card and the cold teaser are one ask each, never both at once.
- Three stacked CV boxes → one card.

### Still to cut, by payoff

1. **HowItWorks off the index.** `/how-it-works` already exists as a route and
   is linked from the hero and the footer. Removing it from `/` costs nothing
   and takes a whole section plus a fourth CV ask off the page.
2. **Filter rail: 13 sections → 3 open + one "ще фільтри".** Роль, скіли,
   рівень carry nearly every real query; ten collapsed headers read as work.
3. **One number on the page.** The 6xl hero counter and the `N found` in the
   list header compete. Let the hero number *become* the filtered count.
4. **Right rail: one CV subject.** `CandidateProfile` + `SkillRecommendations` +
   `SaveCvNudge` are three cards about the same CV; recs belong behind a
   disclosure or on `/me`.
5. **Track strip: one row + "всі напрями"** instead of eleven tiles above the
   fold.

### The management/browsing split

`/me` already owns editing, renaming, deactivating and deleting subscriptions
(`SubscriptionList` + `SubscriptionEditor`) and CVs (`MyCvPanel`). Nothing about
management needs to move there — it is already there. The rule to hold:

> **Home browses and persists one thing. `/me` manages everything persisted.**

So the home page links to `/me#subscriptions`; it must never grow an edit form.

### Mobile

Today `<lg`: the filter panel collapses behind one toggle, the list follows, the
CV rail lands under it. The fixed bottom bar is gone. The list is reachable but
the hero + track strip still cost most of the first screen.

Target (unchanged from task 5): hero short — the number and one line; track strip
as a horizontal tile scroll; then a sticky row `N вакансій · [фільтри] · [резюме]`
opening sheets. **This is the largest piece of the original plan still unbuilt.**

---

## Where this stands (2026-09-17)

`feat/feed-homepage`, 12 commits, branched off `main` at `34a28bf`.

### Shipped

| Theme | What changed |
|---|---|
| one width, one strip | `TrackStrip` replaces `TrackPicker` + `TrackIntro`; hero, strip and feed share a container; a track is one click; no per-card `fit · locked` |
| one subscribe control | `SubscribeCard` serves both states at the top of the filter column (was `SubscribeButton` left / `CvSubscribe` bottom-right); no nested `sticky` inside the sticky rail; the rate sits under the button |
| honest rate | fixed 30-day window, independent of the freshness filter, phrased per week |
| subscriptions as saved searches | the card reads `GET /me/subscriptions`: an identical one becomes "✓ subscribed" + a link to `/me`, the rest (active only) replay their filter onto the page |
| one upload control | the full-width stripe is gone; the CV card (switcher + full-width upload + privacy print) is the only ask once a CV is in view, `ColdRecsTeaser` before that; the whole feed is the drop target |
| auth honesty | an anonymous "Get alerts" opens the login popover instead of 401-ing; a dormant bot says so |
| layout | a viewer no longer collapses the page to one column below `xl`; `lg` keeps the sidebar and wraps the CV rail underneath |
| vocabulary | `off-stack` is one `<OffStackBadge>` with a tooltip; the per-role "N fits" label and the duplicate `N found · page 1` are gone; roles render as full-width rows |

Supporting changes worth knowing about: `FiltersApi.replace` is now on the base
interface (the URL store implements it through `writeFilterState`, the inverse of
`readFilterState`); `subscriptionCriteriaToFilters` learned `skillIds` and a
`sourceId → ?source=code` lookup; localStorage's write-only `subs` half is
deleted.

### Dropped

**Task 3's parallel `/next` route.** The work happened in place, one commit at a
time, each verified — a second indexable copy of the homepage was never needed.
The task's other half (one container width) shipped.

### Shipped 2026-09-17 — how much is on screen

Two of the three items attempted, one commit each, verified at 1440/1100/390
signed out and signed in. The third was built and reverted.

- **`HowItWorks` off the index.** The component tree had no other consumer
  (`/welcome` keeps its own copy), so it is deleted, not just unmounted.
- **One number — built, then reverted.** The hero counter was wired to the
  filtered total (seeded server-side so it never snapped on hydration). It
  worked, and it was wrong: on an untouched index it shrank 14,592 → 3,105,
  because the default freshness window and dedupe are part of what the list
  returns. The 6xl figure is the hero — it lands the size of the corpus on a
  first-time visitor. Trading that for a number the list can carry is a bad
  swap. Reverted in `0d3632a`.
- **Filter rail: 13 headers → 4.** Role, skills and seniority stay open; the
  rest sit behind one `more filters` disclosure carrying a count of what is set
  inside it. No auto-expand on a hidden active filter. `FilterRail` has three
  consumers, so `/me`'s subscription editor and `/feed` inherit the same shape.

**Still open, and now the design item to solve:** with `N found` gone from the
list header and the pager hiding itself below one page, a narrow filter shows
no total anywhere. It belongs in the list header beside the sort control — as
§5 of the original plan said — not in the hero.

Left deliberately: `min fit` is behind the disclosure even in the warm lens
(arguably the one control a CV owner wants open), and the control reads
`more filters` in English because the whole rail still does — task 7 turns the
chrome Ukrainian in one sweep rather than leaving one bilingual rail.

### Remaining, in the order worth doing

1. **Right rail, one subject.** `CandidateProfile` + `SkillRecommendations` +
   `SaveCvNudge` are three cards about one CV.
2. **Track strip in one row** + "всі напрями". Its tile counts are now the only
   number on the page with a different denominator than the hero — they ignore
   freshness, so `Blockchain 28` sits above a hero reading `6`.
3. **Mobile sticky row** — `N вакансій · [фільтри] · [резюме]` with sheets. The
   largest piece of the original plan still unbuilt.
4. **Task 1 — the label convention.** The chrome is still mixed
   (`Get alerts on Telegram` beside `Обери свій напрям`) and the rule is not in
   `STYLE.md` yet.
5. **Task 2 — `source_text` again.** Needs the ADR superseding the current
   privacy clause; nothing started.

### Loose ends this branch leaves

- **Nothing behind a login was verified in a browser.** "✓ subscribed", the CV
  switcher and replaying a saved subscription are covered by unit tests and by
  reasoning, not by a session.
- **`TrackAxisSection`** (roles on track routes) still renders chips with
  `truncate`, so roles look different in the two modes.
- **Two sharp edges in the bot**, found while debugging an invalid deep link,
  deliberately untouched: a second linked Telegram identity silently disables
  every CV subscription's activation (`isCvSubscriptionOwner` requires exactly
  one), and `/start` cannot tell "no such row" from "owned by another account",
  so both say "недійсне або застаріле".
### Closed by the review pass (2026-09-17)

- **URL codec round-trip** is covered (`url-params.spec.ts`), and the params
  matcher now has its `false`-valued flag cases. Both were clean as written.
- **`writeFilterState` left three keys behind.** `nice`/`dupes` (the scope
  toggles) survived a replay, and an emptied `roles`/`skills` was *deleted* —
  which on a track route means "use the preset", so replaying a saved alert on
  `/backend` silently re-added the backend roles and then offered a second
  subscription because the params no longer matched. `replace` now writes an
  empty axis explicitly; `clear` keeps the delete, which is what it wants.
- **The match rate ignored the CV fit gate.** A CV digest notifies on
  STRONG+GOOD (`DEFAULT_CV_MIN_FIT`); the count under the button didn't, so it
  promised several times what Telegram sends. It also rode the live filters
  instead of the settled ones, firing a request per toggle.
- **A duplicate-subscription window.** Between session-ready and
  `/me/subscriptions` landing, the card offered "Get alerts" to someone who
  already had that exact subscription.

Still open from the list above: nothing on the codec; see §Remaining for the
layout work.
