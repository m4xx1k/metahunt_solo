# Light-FSD rules for apps/web

Not canonical FSD (7 layers, ui/model/api segments — ceremony we don't need).
We take three ideas from FSD: **layers with one-directional imports**, **entities as domain
nouns**, **features as verbs**. We add two flexibility mechanisms: **slots** and
**DI via props from server components**.

## Layers (4, not 7)

```
shared    →  ui-kit primitives, charts, lib/api client, lib/utils, lib/hooks
entities  →  domain nouns: vacancy, skill, source, taxonomy-node
features  →  domain verbs: filtering, subscription, ranking, moderation
app       →  routes = composition roots; fetch data, assemble features
```

**Import rule — down only:**

- `shared` knows nothing about the domain. If the word "vacancy"/"seniority" appears in a
  primitive — it is not shared.
- `entities` imports only `shared`. Entity ≠ entity (vacancy does not import skill —
  vacancy *renders* SkillChip? no: see exception below).
- `features` imports `entities` + `shared`. **A feature does not import another feature.**
  Feature intersection is assembled at the app layer via composition/slots.
- `app` imports everything.

**Exception (pragmatism):** vacancy is the central domain entity; its card naturally
renders skill chips and source labels. We allow entities/vacancy → entities/skill,
entities/source. This is the only permitted horizontal import; any new one requires an ADR-level discussion.

## What an entity is here

`entities/<noun>/` = types + pure formatters + **dumb** presentational components:

- `entities/vacancy` — VacancyCard (one!), SeniorityBadge, DuplicatesBadge,
  formatLocations (one implementation!), labels from extracted-vacancy.
- `entities/skill` — SkillChip (required/optional/diff tones).
- `entities/source` — SourceLabel etc.

Entity component: receives DTO via props, fetches nothing, no `use client` unless
strictly necessary, no state. DTO types live in `lib/api/*` (wire contract);
the entity re-exports them — consumers import from the domain, not the transport.

## What a feature is here

`features/<verb-or-capability>/` = UI + client state + url state + adapters:

- `features/vacancy-filters` — filter sections, use-url-filters, FilterAggregates
  adapter types (currently split between components/data/filters and
  market-snapshot/filters).
- `features/market-snapshot` — live market charts/tabs.
- `features/subscribe` — subscription/waitlist forms.

A feature receives data **via props** (DI: server component in app/ fetches via lib/api
and injects) or via an adapter interface (`FilterAggregates` — the feature declares the
shape it needs; the page maps the DTO into that shape). Features do not fetch.

## Slots instead of forks

When a context needs "the same card but with an extra piece" — do not copy the card, add a slot:

```tsx
<VacancyCard vacancy={v} topSlot={<MatchOverlay fit={...} />} aside={<ModerationLinks />} />
```

`MatchCard` already does this via compositor wrapper — that is the correct pattern. Rule:
**variant via slot/props, fork is forbidden** (fork = second card with copy-paste).

## Collocation and promotion (kept — this works)

- Everything is born in `app/<route>/_components/` (tier-3). Landing static sections
  (hero, how, pipeline, problem…) are **content, not features**; they stay collocated
  permanently and do not need FSD-ification.
- Promote to `entities`/`features` when: (a) a second consumer appears, OR
  (b) it is an obvious domain noun/verb already duplicated (like skill chips).
- Demotion: a feature/entity loses its second consumer → move back to `_components/`.

## Anti-ceremony rules

- No `ui/model/api` segments inside a slice while it has ≤ ~6 files. Flat until it hurts.
- No new barrel files (`index.ts`). Imports are direct, by file. The existing
  ui-kit barrel is tolerated; do not create new ones.
- `use client` goes on the leaf (button, toggle), not the section. If a section became
  client "for convenience" — that is a signal to extract the interactive leaf.
- Name collisions are forbidden: two `Section.tsx` in different layers is a naming bug
  (`CollapsibleSection` vs `Section`).
- File > ~250 lines probably contains 2+ components; consider splitting (not dogma).

## What we consciously do NOT do

- No `widgets`/`processes` layers — Next App Router already provides page-level composition.
- Do not move `lib/` and `components/ui-kit` (already a valid shared layer; moving = churn with no gain).
- No DI containers/contexts "for the future" — DI here = props from server component +
  adapter types. That is sufficient.
