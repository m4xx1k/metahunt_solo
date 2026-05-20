# TODO — Vacancy filters MVP (search + seniority + workFormat)

**Target files:**
- `apps/etl/src/vacancies/vacancies.controller.ts`
- `apps/etl/src/vacancies/vacancies.service.ts`
- `apps/web/lib/api/vacancies.ts` (extend `ListVacanciesParams` passthrough)
- `apps/web/app/(investigation)/vacancies/page.tsx`
- `apps/web/app/(investigation)/vacancies/_components/SearchInput.tsx` (new)
- `apps/web/app/(investigation)/vacancies/_components/ChipFilter.tsx` (new)
- `apps/etl/src/vacancies/vacancies.service.spec.ts` (extend if exists, otherwise inline checks via curl)

**Suggested branch:** `feat/vacancy-filters-mvp`
**Estimated time:** one focused session (~3–4 hours, no schema changes)

---

## Why this matters now

The build-in-public pitch ("I'm searching for React, the aggregator shows me Backend where React is nice-to-have") **doesn't survive a screenshot of the current `/vacancies` page**, because the page only has two toggles (`includeRoleless`, `includeAllSkills`) and no search box. The most valuable demo for the upcoming Threads/TG post is a side-by-side: *generic listing → filter applied → tight result set*. Without a visible filter row, the post has nothing to show.

The contract (`vacancies.contract.ts`) already declares every filter we'd ever want, and `q` ILIKE works in the service. Wiring `seniority` + `workFormat` is ~30 lines on the backend; adding the input + two chip rows is the visual payload. Skill-level filtering — the actual killer feature — is intentionally **out of scope for this session** (see "Scaling" block).

---

## Read first

In order:

1. `apps/etl/src/vacancies/vacancies.contract.ts` — already declares `seniority`, `workFormat`, `Seniority`, `WorkFormat` enums. The DTO returns these fields on every item. No contract change needed.
2. `apps/etl/src/vacancies/vacancies.service.ts` lines 30–177 — `ListVacanciesParams` interface + `list()` method. You're adding two `WHERE` clauses to `buildWhere()`.
3. `apps/etl/src/vacancies/vacancies.controller.ts` — see how `sourceId` is parsed/forwarded. New filters follow the same trim-and-forward shape.
4. `apps/web/app/(investigation)/vacancies/page.tsx` — current page. You're adding three search-param reads + one component import.
5. `apps/web/app/(investigation)/vacancies/_components/FilterToggles.tsx` — the existing toggle-chip pattern. **Reuse its `buildHref` logic** for chip filters (resets `offset` on change, preserves other params).

---

## What to build (in this order)

### 1. Backend: extend `ListVacanciesParams` and `list()`

In `vacancies.service.ts`:

```ts
export interface ListVacanciesParams {
  page: number;
  pageSize: number;
  q?: string;
  sourceId?: string;
  seniority?: Seniority;        // NEW — import the type from contract
  workFormat?: WorkFormat;      // NEW
  includeRoleless?: boolean;
  includeAllSkills?: boolean;
}
```

In `buildWhere()` add:
```ts
if (params.seniority) conds.push(eq(vacancies.seniority, params.seniority));
if (params.workFormat) conds.push(eq(vacancies.workFormat, params.workFormat));
```

Both columns are pgEnums on the `vacancies` table — no joins, no nullability gotchas. Default behavior (`undefined` → no filter) matches the current `q`/`sourceId` style.

### 2. Backend: wire query params in controller

In `vacancies.controller.ts`:

- Add `@Query("seniority") rawSeniority?: string` and `@Query("workFormat") rawWorkFormat?: string`.
- Parse via two helpers `parseSeniority` / `parseWorkFormat` that validate against the enum values and throw `BadRequestException` on garbage. Mirror the `parseBool` shape.
- Forward to `vacancies.list(...)`.

Valid `Seniority` values: `INTERN | JUNIOR | MIDDLE | SENIOR | LEAD | PRINCIPAL | C_LEVEL`.
Valid `WorkFormat` values: `REMOTE | OFFICE | HYBRID`.

### 3. Web client: extend the fetcher

In `apps/web/lib/api/vacancies.ts` find the `list()` signature and add `seniority?: Seniority` and `workFormat?: WorkFormat` to the params type. Append them to the URL builder. **Import the enum types from the contract** — don't duplicate the string unions.

### 4. UI: `SearchInput.tsx` (new, ~40 lines)

A client component:
- Controlled `<input type="search">` with a debounced (300ms) URL update via `useRouter().replace`.
- Reads initial value from `searchParams.q`.
- On submit/blur (or after debounce), writes `?q=<value>&offset=0` while preserving all other params.
- Placeholder: `> search by title…`
- Style: match the brutalist border / mono font of `FilterToggles.tsx`. Same height as chips.
- Empty/whitespace value → omit `q` from the URL entirely (don't leave `?q=`).

### 5. UI: `ChipFilter.tsx` (new, generic, ~50 lines)

Renders a labelled row of mutually-exclusive chips backed by a single search-param key:

```ts
interface ChipFilterProps {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  paramKey: string;                          // "seniority"
  label: string;                             // "seniority:"
  options: { value: string; label: string }[]; // [{value:"SENIOR", label:"senior"}, …]
}
```

Behavior:
- Each chip is a `<Link>` that toggles its own `value` in the URL. Clicking the active chip clears it.
- Always reset `offset=0` on change (copy `buildHref` from `FilterToggles.tsx`).
- Visually identical to the existing toggles (same active/inactive border/shadow), so the row stays cohesive.

### 6. Wire into the page

In `app/(investigation)/vacancies/page.tsx`:

- Read `q`, `seniority`, `workFormat` from `searchParams` (q already exists, just don't lose it).
- Pass `seniority` and `workFormat` into `vacanciesApi.list(...)`. The fetcher just URL-encodes them; the backend validates.
- Above the existing `FilterToggles` block, render in order:
  1. `<SearchInput />`
  2. `<ChipFilter paramKey="seniority" label="seniority:" options={SENIORITY_OPTIONS} />`
  3. `<ChipFilter paramKey="workFormat" label="format:" options={WORK_FORMAT_OPTIONS} />`
  4. existing `<FilterToggles />` (verified-only toggles stay where they are — they're conceptually different)
- Use the existing `*_LABELS` constants from `@/lib/extracted-vacancy` to build the option lists (`SENIORITY_LABELS`, `WORK_FORMAT_LABELS`) — don't hard-code the labels.

---

## How to measure (verification)

```bash
# Backend
curl -s "http://localhost:4567/vacancies?seniority=SENIOR&pageSize=5" | jq '.items | map(.seniority) | unique'
#   expect ["SENIOR"]

curl -s "http://localhost:4567/vacancies?seniority=BOGUS" -w "%{http_code}"
#   expect 400

curl -s "http://localhost:4567/vacancies?workFormat=REMOTE&seniority=MIDDLE" | jq '.total'
#   expect a number, no errors

# UI
pnpm dev
# Visit /vacancies → confirm:
#   - search box renders, typing "react" updates the URL after debounce, list refreshes
#   - seniority row renders 7 chips; clicking [senior] adds ?seniority=SENIOR&offset=0
#   - clicking active chip removes the param
#   - workFormat row renders 3 chips and stacks with seniority (both can be active)
#   - pagination preserves all active filters across pages
```

---

## Definition of done

- All four URL params (`q`, `seniority`, `workFormat`, existing toggles) compose correctly. Each one alone works; all four at once works.
- Invalid enum values return `400` from the API.
- Resetting `offset=0` on any filter change is verified by clicking a chip while on page 3.
- Empty `q` does **not** end up in the URL.
- `pnpm --filter @metahunt/etl test` is green. `pnpm --filter @metahunt/web build` is green.
- No new tier-2 components — `SearchInput` and `ChipFilter` stay in `app/(investigation)/vacancies/_components/` for now (rule of three in `apps/web/CLAUDE.md`).

---

## Things to NOT do

- **Don't** wire `englishLevel`, `engagementType`, `experienceMin/Max`, `salaryFloor`, `currency`, `skillIds`. They're contract-declared but each has UX questions (range slider? autocomplete? currency UX?) that are bigger than a checkbox. Park them.
- **Don't** add the skill filter in this session. Single-skill filter looks easy on paper but needs a `nodes` lookup endpoint, autocomplete UX, AND/OR semantics call, and the visible "required vs optional" toggle. Separate task — see the Scaling block.
- **Don't** replace the existing `includeRoleless` / `includeAllSkills` toggles with chips. They're meta-filters (control which rows are eligible at all), not subject filters. Keeping them visually distinct prevents user confusion.
- **Don't** introduce a client-side state library. URL-as-state already works for this page; adding zustand/jotai/whatever is premature.
- **Don't** "improve" `q` to be tsvector full-text. ILIKE is fine for title-only search at current scale; tsvector belongs in the Scaling block once we have descriptions in the search corpus.

---

## Commit format

```
feat(vacancies): search input + seniority/workFormat chip filters

- service+controller: wire seniority/workFormat params with enum validation
- web: SearchInput (debounced ?q=) + generic ChipFilter component
- page: stack search → seniority → workFormat → existing toggles
```

---

## Scaling — what comes after this MVP

Once the post ships and we see real filter usage from analytics (see `click-tracking-mvp.md`), the next iterations are:

1. **Skill filter (the headline feature).** Single-skill v1: new `GET /nodes/skills?q=&limit=20` endpoint (autocomplete over `nodes WHERE type='skill' AND status='VERIFIED'`), a combobox component on the page, `skillId` query param wired through service into a `vacancyNodes` join. Then expand to `skillIds[]` with AND semantics (already in contract). Then split into "required" vs "optional" buckets — clicking *Required: React* should not match vacancies where React is only `nice-to-have`. This is the screenshot that closes the build-in-public loop.

2. **Bulk-wire remaining enum filters.** `englishLevel`, `engagementType`, `employmentType` are all enums on the table — same pattern as this MVP, ~5 min each once `ChipFilter` exists. Do them in a single PR when there's demand signal.

3. **Range filters (experience, salary).** Need a different component (dual-handle slider or two inputs). Salary is multi-currency, so the UX must include `currency` as a sibling control. Make this its own session.

4. **Full-text search.** Replace `title ILIKE %q%` with `to_tsvector(title || ' ' || description) @@ plainto_tsquery($1)`. Requires a GIN index and config for Ukrainian + English stemming. Massive impact on relevance but complex enough to deserve an ADR.

5. **Server-side faceted counts.** When the user sets `seniority=SENIOR`, the workFormat chips should show counts ("remote (24) · hybrid (8) · office (2)") so users see the consequence of each toggle before clicking. Single SQL query with `GROUP BY` per facet; add to the `aggregates` endpoint.

6. **Saved searches / shareable filter URLs.** URLs already encode state, so "share" is free. "Save" + "notify me" needs accounts → that's Stage 08+ territory.

7. **Filter-aware sort.** Currently fixed to `loadedAt DESC`. Once skill filters land, "rank by skill match strength" becomes meaningful (vacancy with React as required > vacancy with React only as optional > vacancy mentioning React in title).

The key constraint to keep in mind: **every new filter must be expressible in the URL as a single query string**, and **every filter change must reset `offset=0`**. These two rules keep the system shareable, debuggable, and stateless. Don't break them for a "nicer" UX shortcut.
