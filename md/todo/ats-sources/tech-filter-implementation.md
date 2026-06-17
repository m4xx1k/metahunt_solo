# Tech-vacancy filter — shipped design

Status: **implemented 2026-06-13** on branch `feat/tech-filter` (uncommitted at time of writing). Builds on [it-filter-research.md](it-filter-research.md) (the two confirmed bugs + gate rationale). Scope locked: **dev-core + QA/DevOps/Data/security, NO PM/design** (see research §4).

## Architecture: two hard-skip gates, NO column

The original plan added an `is_tech` boolean column on `vacancies` + a feed serve-gate. **Rejected** — it would mean threading `is_tech` through every feed/ranking/dedup query. Instead non-tech is dropped at the source, never stored. Both gates *skip*, nothing to filter downstream:

| Gate | Where | Question | Tool |
|---|---|---|---|
| **Gate 1** `passesTechGate` | ingest (RSS parse) | "worth extraction tokens?" | cheap regex, recall-biased |
| **Gate 2** `isTech` | loader (post-extraction) | "store it?" | LLM-derived, precision-biased |

Gate 1 false-block = vacancy lost forever, so it's recall-biased (lean PASS). Gate 2 reads the full body, so it's the precise leak-killer. `rss_records` (raw feed) persist regardless → a dropped vacancy is re-derivable if a gate is later found wrong.

### Gate 1 — `passesTechGate(input)` — ingest

`input = { title, department? }` (department only from ATS). Returns `{pass, stage}` where `stage ∈ dept_pass | dept_block | blacklist | whitelist | unknown_block`.

```
normalize(title): lowercase → NFC → collapse [\s_/|,–—-]+ to one space → trim
                  (keeps . # + so "c#", "c++", ".net", "node.js" survive)
rolePart(t):      t.split(/ (?:в|at) /)[0]  — the role, sans employer/location tail

1. department present:
     dept ∈ TECH_DEPTS    → PASS  (dept_pass)
     dept ∈ NONTECH_DEPTS → BLOCK (dept_block)
     else                 → fall through
2. BLACKLIST scans rolePart's HEAD → BLOCK (blacklist)   ← parens stripped
3. WHITELIST scans full title      → PASS  (whitelist)   ← rescue-only
4. else                            → BLOCK (unknown_block; strict, RSS is tech-heavy)
```

**Why role-scoped blacklist (key fix):** `vacancies.title` is the full RSS string ("role в Company, City"). Stem blacklist over the whole string false-blocked real dev jobs on employer names ("Backend Engineer **в NDA Recruitment**", "**Конструкторське** бюро", "Growe **Talents**"). Scanning only the role portion fixes it; whitelist stays on the full title so it can only ever rescue, never lose a hit.

**Why head-scoped, not just role-scoped (2026-06-17 follow-up):** the blacklist now scans the role's *head* (`roleHead` strips `(...)`), not the whole role. A parenthetical names a skill/system, not the function — "QA Engineer **(Siebel CRM)**" is a tester, not a CRM role, so `crm` in parens must not block it (it was, deleting real QA jobs). "CRM Team Lead" keeps `crm` in the head and is still blocked. Same pass found `Business Developer` leaking in via the whitelist's `develop` stem → added `business\s?develop` to the blacklist (BizDev is sales, not dev).

Wired: `rss-parser.service.ts` → `items.filter(i => passesTechGate({title: i.title}).pass)`.

### Gate 2 — `isTech` — loader

BAML `ExtractedVacancy.isTech bool` (the LLM read the posting). Loader:
```ts
if (extracted.isTech === false) { log; return null; }  // drop, don't store
```
Only an explicit `false` skips — missing (older records) or `true` falls through, so it's backward compatible. `loadFromRecord` returns `string | null` (null = skipped); callers already ignored the return. No column, no feed/ranking/dedup change.

## Vocab (start small, grow from logs — research §2.4)

Lives in `vacancy-filter.ts`. Unicode-safe boundaries via `word(body)` = `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` (old `\b` was ASCII-only → every Cyrillic pattern was dead code). Stems (`develop`, `engineer`, `recruit`) stay as bare substrings; short/ambiguous tokens (`hr`, `pr`, `ai`, `ml`, `qa`, `crm`, `sre`…) are `word()`-bounded.

Tuning notes baked in from the prod dry-run:
- `talent` is `word()`-bounded (was matching company "Growe Talents").
- `lead gen` has an end-boundary `lead\s?gen(eration)?(?![\p{L}\p{N}])` (was matching "Lead **Gen**eral QA").
- standalone `ui` / `ux` / `graphic` **removed** — they hit QA skill lists ("UI Automation", "UI, Load") and graphics *programmers* ("Web Graphics Developer"); `/designer/` still covers the design roles.

`TECH_DEPTS` / `NONTECH_DEPTS` are exact-match sets on the normalized department string.

## Files changed

| File | Change |
|---|---|
| `apps/etl/src/01-ingest/rss/utils/vacancy-filter.ts` | rewrite: `passesTechGate`, Unicode boundaries, role-scoped stem blacklist, dept map, `{pass, stage}` |
| `apps/etl/src/01-ingest/rss/utils/vacancy-filter.spec.ts` | rewrite: stage assertions + role-scoping + dept regression cases |
| `apps/etl/src/01-ingest/rss/rss-parser.service.ts` | call-site `isITVacancy` → `passesTechGate(...).pass` |
| `apps/etl/baml_src/extract-vacancy.baml` | add `isTech bool` to `ExtractedVacancy` (+ regenerate `baml_client`) |
| `apps/etl/src/02-enrich/loader/services/vacancy-loader.service.ts` | skip upsert when `isTech === false`; return `string \| null` |
| `apps/etl/src/02-enrich/loader/activities/load-vacancy.activity.ts` | return type `string \| null` |
| `apps/etl/src/02-enrich/extraction/placeholder.extractor.ts` | add `isTech: true` to fixture |

**No schema change** — `is_tech` column and migration `0020` were generated then reverted. No re-embedding (dedup untouched).

## One-time prod cleanup (done 2026-06-13)

`scripts/cleanup-nontech.ts` re-runs the fixed Gate 1 over stored rows and deletes blacklist hits (brings prod in line with the fixed gate). Dry-run by default, `--apply` to commit. FK-aware in one transaction: clears `sent_notifications`, deletes junk-canonical `unique_vacancies` groups (siblings detach via `ON DELETE SET NULL`, re-grouped by the next dedup sweep), `vacancy_nodes` cascade.

Result: deleted **85** junk rows (7874 → 7789), zero tech rows affected (79 singletons + 3 all-junk pairs). Going forward both gates hard-skip, so nothing new accumulates.

**Re-run 2026-06-17:** after the head-scoping + `business-develop` fix, a second pass deleted **19** rows (media-buying/CRM/recruitment leads + `Business Developer` roles the old gate leaked). The two `QA Engineer (… CRM)` rows the buggy gate would have deleted are now correctly kept. (Some junk re-accumulates between cleanups because Gate 1 ran with the buggy logic until this branch; with the fix merged, the corpus stays clean.)

## Observability (next, optional)

`passesTechGate` returns `stage` for counters. Aggregate per ingest into the `rss_ingests` finalize note: `passed=N (dept=a,wl=b) blocked=M (dept=c,bl=d,unknown=e)`. Plus count Gate-2 `isTech=false` skips per load = the leak rate Gate 1 missed. These two numbers tune the vocab from data, not vibes.

## Test plan (`vacancy-filter.spec.ts`) — all green (32 cases)

Regression cases (each maps to a real bug): Cyrillic whitelist/blacklist (`Розробник Python` pass, `Бухгалтер` block — were dead code), `Media Buying Team Lead` block (the leak), `Backend Engineer в NDA Recruitment` PASS (role-scope), `Інженер-конструктор` block (in-role term still fires), dept beats title (`Growth Engineer`/Engineering pass, `Account Executive`/Sales block), `LLM Researcher` → unknown_block. Loader: `isTech=false` → null + no upsert; `isTech=true` → upsert.
