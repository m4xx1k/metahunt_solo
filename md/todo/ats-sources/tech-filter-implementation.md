# Tech-vacancy filter — implementation plan

Status: ready-to-build, 2026-06-12. Builds on [it-filter-research.md](it-filter-research.md) (the two confirmed bugs + 4-layer rationale). This doc = exact files, rules, schema, migration. Scope locked: **dev-core + QA/DevOps/Data/security, NO PM/design** (see research §4).

## Naming

Rename the concept **IT → Tech**. "Sales at an IT company" is IT but not a tech role; `isTech` says what we mean.

| Thing | Old | New |
|---|---|---|
| Ingest prefilter fn | `isITVacancy(title)` | `passesTechGate(input)` |
| Serve flag (DB col) | — (didn't exist) | `vacancies.is_tech` (boolean, nullable) |
| BAML field | — | `ExtractedVacancy.isTech` |

Two distinct gates, never conflated again:
- **`passesTechGate`** — cheap, recall-biased, pre-LLM. "worth extraction tokens?" Wrong-pass costs cents.
- **`is_tech`** — authoritative, LLM-derived, post-extraction. "show to users?" The leak-killer; feed trusts this.

## The rules (logical, ordered, simple)

### Gate 1 — `passesTechGate(input)` — ingest

`input = { title: string, department?: string }` (department only from ATS).

```
normalize(title): lowercase → NFC → collapse [\s_/|,–—-]+ to single space → trim

1. If department present:
     dept ∈ TECH_DEPTS      → PASS   (skip title regex; saves "Growth Engineer" etc.)
     dept ∈ NONTECH_DEPTS   → BLOCK
     else                   → fall through to step 2
2. Title regex (order matters — blacklist first):
     matches any BLACKLIST stem  → BLOCK
     matches any WHITELIST token  → PASS
     else (UNKNOWN)               → BLOCK   (strict; RSS feeds are tech-heavy, dev-core scope)
```

Everything that PASSes → extraction → `is_tech` is set → Gate 2.

### Gate 2 — `is_tech IS DISTINCT FROM false` — serve

In `feed.service.ts buildWhere` (one line). Ranking inherits it (RankingService delegates to FeedService). `NULL` (old rows / unscored) = shown; only a confirmed `false` is hidden. A regex leak that slips Gate 1 dies here once the LLM tags it.

### Vocab (start small, grow from logs — research §2.4)

```ts
// Cyrillic terms now actually work via Unicode boundaries (old \b was dead code)
const TECH_DEPTS = ['engineering','software','development','data','it',
  'r&d','research and development','devops','infrastructure','platform','security','qa','quality'];
const NONTECH_DEPTS = ['sales','marketing','growth','people','hr','human resources','talent',
  'recruiting','finance','legal','support','customer success','customer service',
  'operations','administrative','design','product','project management'];

// BLACKLIST — match FUNCTION STEMS, not exact titles (kills "Media Buying Team Lead")
const BLACKLIST = [
  /media\s?buy/, /user\s?acquisition/, /\baso\b/, /influencer/, /\bppc\b/, /\bseo\b/, /\bsmm\b/,
  /affiliate/, /lead\s?gen/, /copywrit/, /content/, /\bbrand/, /\bpr\b/, /retention/, /\bcrm\b/,
  /recruit/, /talent/, /\bhr\b/, /human\s?resources/, /headhunt/, /people\s?(partner|ops)/,
  /\bsales\b/, /account\s?manager/, /bizdev/, /customer\s?(success|service|support)/,
  /lawyer/, /legal/, /accountant/, /бухгалтер/, /finance/, /financial/, /translator/, /teacher/, /trainer/,
  /\b(product|project)\s?manager/, /\bpm\b/, /\bpo\b/, /scrum\s?master/, /delivery\s?manager/,
  /designer/, /дизайнер/, /\bux\b/, /\bui\b/, /interior/, /graphic/, /motion/,
  /mechanical/, /civil/, /electrical/, /електрик/, /конструктор/,
];

// WHITELIST — tech roles + stacks (dev + QA + DevOps + data + security)
const WHITELIST = [
  /develop(er|ment)/, /розробник/, /engineer/, /інженер/, /programmer/, /\bcoder\b/,
  /architect/, /архітектор/, /tech\s?lead/, /team\s?lead/, /\bcto\b/,
  /\bqa\b/, /tester/, /quality\s?assurance/, /\bsdet\b/, /\baqa\b/, /тестувальник/,
  /devops/, /\bsre\b/, /reliability/, /sysadmin/, /administrator/, /security/, /pentest/, /infosec/, /кібербезпек/,
  /front\s?end/, /back\s?end/, /full\s?stack/, /mobile/, /android/, /\bios\b/,
  /data\s?(scientist|analyst|engineer)/, /machine\s?learning/, /\bml\b/, /\bai\b/, /\bdba\b/, /database/, /аналітик\s?даних/,
  /embedded/, /firmware/, /hardware/,
  /python|java(script)?|typescript|golang|\brust\b|\bphp\b|ruby|kotlin|swift|c\+\+|c#|\.net|react|angular|vue|node|django|laravel|spring|flutter|solidity|kubernetes|terraform/,
];
```

Boundary helper (replaces broken `\b` — Cyrillic-safe):
```ts
const tok = (s: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`, 'iu');
// apply to whole-word terms; substring stems (media\s?buy, develop) stay as-is.
```

## Files to change

| File | Change |
|---|---|
| `apps/etl/src/01-ingest/rss/utils/vacancy-filter.ts` | rewrite: `passesTechGate(input)`, Unicode boundaries, stem blacklist, dept map, return `{pass, stage}` for counters. Delete dead commented block. |
| `apps/etl/src/01-ingest/rss/rss-parser.service.ts:36` | `isITVacancy(item.title)` → `passesTechGate({title: item.title})` |
| `libs/database/src/schema/vacancies.ts` | add `isTech: boolean('is_tech')` |
| `apps/etl/baml_src/extract-vacancy.baml` | add `isTech bool` field to `ExtractedVacancy` (see prompt below) |
| `apps/etl/src/02-enrich/loader/services/vacancy-loader.service.ts:84` | add `isTech: extracted.isTech ?? null,` to `values` |
| `apps/etl/src/02-enrich/loader/repositories/vacancy.repository.ts` | add `isTech` to `VacancyUpsertValues` + upsert column set |
| `apps/etl/src/03-discovery/feed/feed.service.ts` (`buildWhere`) | `conds.push(sql\`${vacancies.isTech} IS DISTINCT FROM false\`)` |

BAML field:
```
isTech bool @description(#"
  TRUE if this is a technical/engineering role: software dev, QA, DevOps/SRE,
  data, security, embedded, or engineering management of those.
  FALSE for non-tech roles even at a tech company: sales, marketing, media
  buying, copywriting, recruiting/HR, finance, legal, support, product/project
  management, design (UI/UX/graphic).
"#)
```

## Migration

Drizzle-kit (matches existing `0019_*` numbering, scripts in `package.json`):

```bash
npm run db:generate     # → libs/database/migrations/0020_*.sql : ALTER TABLE vacancies ADD COLUMN is_tech boolean;
npm run db:migrate      # apply
```

- **Nullable, no default** → existing ~3-4k rows become `NULL` = still shown (Gate 2 only hides `false`). Zero behavior change on deploy; no lock risk (ADD COLUMN nullable is instant in PG16).
- **No index** for now: at 3-4k rows seq-scan is fine and `IS DISTINCT FROM false` indexes poorly. Revisit (partial index `WHERE is_tech = false`) only past ~100k rows.
- **No re-embedding**: `is_tech` isn't in embedding text → `embeddingSourceHash` unchanged → dedup untouched.

## Backfill

`is_tech = NULL` is safe (shown). Populate two ways, both fine to defer past the deploy:
1. **Forward**: every newly-extracted record sets it. No action.
2. **Existing rows**: piggyback on the compensation-v2 re-extract pass (global-fields-research §5) — same cheap-model sweep over open vacancies fills `is_tech` too. Until then, optional one-shot **deterministic** pre-clean (no LLM): `UPDATE vacancies SET is_tech = false WHERE role_node_id IS NULL AND <title ~ blacklist>` — clears the obvious leaked junk immediately. Recommended: ship the gate, run the deterministic pre-clean same day, let re-extract finish the rest.

## Observability (resurrect, minimally)

`passesTechGate` returns `{pass, stage: 'dept_pass'|'dept_block'|'blacklist'|'whitelist'|'unknown_block'}`. Aggregate per ingest into the `rss_ingests` finalize note: `passed=N (dept=a,wl=b) blocked=M (dept=c,bl=d,unknown=e)`. Plus LLM side: count `is_tech=false` per ingest = the leak rate Gate 1 missed. These two numbers are how the vocab gets tuned from data, not vibes.

## Test plan (`vacancy-filter.spec.ts`)

Regression cases that must pass (each maps to a real bug):
- `passesTechGate({title:'Розробник Python'})` → pass (Cyrillic whitelist — was dead)
- `passesTechGate({title:'Бухгалтер'})` → block (Cyrillic blacklist — was dead)
- `passesTechGate({title:'Графічний дизайнер'})` → block
- `passesTechGate({title:'Media Buying Team Lead'})` → block (the leak)
- `passesTechGate({title:'Senior Backend Engineer'})` → pass
- `passesTechGate({title:'Growth Engineer', department:'Engineering'})` → pass (dept beats title)
- `passesTechGate({title:'Account Executive', department:'Sales'})` → block
- `passesTechGate({title:'LLM Researcher'})` → block by current vocab → **logged unknown_block** (review candidate)

## Rollout order

1. Gate 1 rewrite + tests + parser call-site. (Ships standalone — fixes the live Cyrillic + leak bugs in RSS today, no schema needed.)
2. Migration `0020` + loader/repo wiring + BAML `isTech` + feed `buildWhere` predicate. (Serve gate live; new rows scored.)
3. Deterministic pre-clean UPDATE + counters in finalize note.
4. Full re-extract backfill — shared with compensation-v2 pass.

Step 1 alone is the highest-value half-day: it stops the bleeding without touching the DB. Steps 2-4 add the durable safety net.
