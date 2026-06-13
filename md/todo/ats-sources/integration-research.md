# ATS API ingestion — integration research

Status: research, 2026-06-12. Companion to [README.md](README.md) (445 validated boards) and [ats-slugs.tsv](ats-slugs.tsv).
Question: how to ingest Ashby/Greenhouse/Lever/Recruitee/SmartRecruiters job-board APIs alongside the existing RSS pipeline — scheduling, parsing, dedup, lifecycle, cost.

## TL;DR recommendation

Reuse ~90% of the existing pipeline. ATS ingestion is *easier* than RSS: structured JSON, stable native job IDs, full-board snapshots (→ free closed-job detection), and clean per-company attribution. The work is one new ingest module with a thin per-ATS adapter that normalizes a board payload into the existing `rss_records` shape, plus 3 small schema changes. Phase 1 (UA tier, Ashby+Greenhouse+Lever, ~35 boards) is ~2-3 days of work.

## 1. Current pipeline (what we plug into)

- **Schedule**: Temporal schedule `rss-ingest-hourly` (`apps/etl/src/01-ingest/rss/rss-scheduler.service.ts:14`), every `RSS_INGEST_INTERVAL_HOURS` between 06:00–22:00 Europe/Kyiv, overlap SKIP → `rssIngestAllWorkflow` → child `rssIngestWorkflow(sourceId)` per source with `rss_url IS NOT NULL`.
- **Bronze**: `fetchAndStore` (raw XML → S3, `rss_ingests` row) → `parseAndDedup` (XML→items, `isITVacancy` title filter, per-source `extractExternalId` registry, sha256 content-hash dedup, insert `rss_records`) → `extractAndInsert` per new record (BAML LLM → `extracted_data` jsonb).
- **Silver**: child `vacancyPipelineWorkflow(rssRecordId)` → `loadVacancy` → `vacancies` row (unique on `(source_id, external_id)`), then semantic dedup (embed + resolve, pgvector HNSW) groups into `unique_vacancies`.
- **Company identity**: `company_identifiers (source_id, source_company_name) → company_id`.
- **Sources**: `sources(id, code, display_name, base_url, rss_url)` — no type discriminator yet.

## 2. Schema changes (3 small ones)

```ts
// sources — add discriminator + ATS config; rss_url stays for RSS rows
kind: text('kind').notNull().default('rss'),        // 'rss' | 'ats'
atsType: text('ats_type'),                          // 'ashby' | 'greenhouse' | 'lever' | 'recruitee' | 'smartrecruiters' | 'workable'
atsSlug: text('ats_slug'),                          // board token
// optional per-source ingest policy (see §6): jsonb config e.g. {"filter": "ua-remote-eu" | "all"}
```

- One `sources` row per board (445 rows max — fine). `code` = `ats:<atsType>:<slug>` keeps the existing per-source-code conventions working.
- `vacancies` — add `closedAt timestamp` (nullable). §7.
- `rss_records` / `rss_ingests` — **reuse as-is** (KISS; rename to `raw_records` is cosmetic churn, skip). ATS adapter fills `title`, `description` (sanitized text), `link` (jobUrl), `externalId` (native job id), `publishedAt`, `category` (department/team). `hash` = sha256 over the same canonical fields → content-change detection for free (job edited → new hash → re-extract, same `(source_id, external_id)` → upsert in loader keeps one vacancy row).

## 3. Adapter design

New module `apps/etl/src/01-ingest/ats/` mirroring the rss module:

```ts
interface AtsAdapter {
  fetchBoard(slug: string): Promise<RawBoard>;      // 1-2 HTTP calls, returns raw JSON
  toItems(raw: RawBoard): NormalizedItem[];          // pure mapping
}
interface NormalizedItem {
  externalId: string;        // native job id (uuid / numeric id / shortcode)
  title: string;
  descriptionHtml: string;   // sanitized to text before insert (reuse 02-enrich/dedup/sanitize.ts approach)
  link: string;              // jobUrl / absolute_url / hostedUrl
  publishedAt: Date | null;  // see per-ATS notes; null → first-seen now()
  locations: string[];       // primary + secondary, raw strings
  isRemote: boolean | null;
  employmentType: string | null;  // maps to existing enum where possible
  department?: string; team?: string;
  compensation?: { min?: number; max?: number; currency?: string } | null;
}
```

Workflow: `atsIngestAllWorkflow` → child `atsIngestWorkflow(sourceId)` → activities `atsFetchAndStore` (raw JSON → S3 `ats/<sourceId>/<ingestId>.json`, `rss_ingests` row) → `atsParseAndStore` (adapter.toItems → filter → hash-dedup → `rss_records`) → reuse **unchanged** `extractAndInsert` + `vacancyPipelineWorkflow`. The only fork point vs RSS is the first two activities.

### Per-ATS field mapping (validated against live responses)

| Field | Ashby | Greenhouse | Lever | Recruitee | SmartRecruiters |
|---|---|---|---|---|---|
| endpoint | `posting-api/job-board/<slug>?includeCompensation=true` | `v1/boards/<slug>/jobs?content=true` | `v0/postings/<slug>?mode=json` | `<slug>.recruitee.com/api/offers/` | `v1/companies/<slug>/postings` (paginate `limit/offset`) + per-job detail for description |
| job id | `id` (uuid) | `id` (int) | `id` (uuid) | `id` (int) | `id` |
| title | `title` | `title` | `text` | `title` | `name` |
| description | `descriptionHtml` ✅ | `content` (HTML-escaped! unescape first) ✅ | `description` html / `descriptionPlain` ✅ | `description`+`requirements` ✅ | ❌ needs N+1 detail calls — defer |
| location | `location` + `secondaryLocations[]` + `address.postalAddress` | `location.name` (one string) | `categories.location` + `allLocations[]` + `country` | `location`, `country_code` | `location.{city,country,remote}` |
| remote | `isRemote`, `workplaceType` | string-match on location | `workplaceType` | `remote` | `location.remote` |
| published | `publishedAt` ✅ | `updated_at` (no first-published!) → first-seen | `createdAt` (epoch ms) ✅ | `created_at` ✅ | `releasedDate` ✅ |
| employment | `employmentType` ('FullTime'…) | ❌ (LLM) | `categories.commitment` | `employment_type_code` | `typeOfEmployment` |
| salary | `compensation` (with flag) | ❌ (`pay_input_ranges` only on some) | `salaryRange` (rare) | ❌ | ❌ |
| dept/team | `department`, `team` | `departments[]` | `categories.{department,team}` | `department` | `function` |

Notes:
- **Greenhouse `content=true`** inflates payload (Stripe board ~10-20MB). Fetch without `content` first; if board is large, fetch per-job `/jobs/<id>` only for *new* hashes. For ≤200-job boards just use `content=true` — simpler.
- **Workable**: widget API has no descriptions and many stale empty accounts → skip in v1.
- **SmartRecruiters**: description needs per-job call → only 4 boards in our list, defer to v2.
- Compensation: Ashby's `?includeCompensation=true` is the single best structured-salary source we'll have. Map to `salaryMin/Max/currency` directly, bypassing LLM for those fields.

## 4. What the LLM still does (and what it stops doing)

ATS gives us: title, company, locations, remote, employment type, salary (ashby), department, published date. LLM extraction remains for: **seniority, englishLevel, experienceYears, role/domain/skill taxonomy nodes, engagementType, hasTestAssignment, hasReservation** — i.e. the semantic fields. Two options:

- **A (KISS, v1)**: run the existing extractor unchanged on `Title + sanitized description`; loader prefers ATS-structured values over LLM values where both exist (locations, salary, employmentType, workFormat). One merge function in the loader, zero prompt changes.
- **B (v2 optimization)**: extend BAML prompt with "known fields" context so the LLM skips them → fewer output tokens, better consistency. Do only if extraction cost/quality demands it (check `extraction_cost` view, migration 0008).

## 5. Scheduling

- **Separate Temporal schedule** `ats-ingest-daily` mirroring `RssSchedulerService` — don't merge into the hourly RSS schedule: ATS boards churn slowly (a board posts a handful of jobs/week) and 445 boards/hour is wasted load.
- Cadence: **1×–2×/day** (e.g. 07:00 & 15:00 Kyiv). Each cycle = ~445 GETs + per-job greenhouse details — minutes of wall-clock with modest concurrency.
- Concurrency: Temporal already fans out per-source child workflows; cap activity concurrency at the worker (e.g. 8-10 parallel fetches) — that's our politeness story; no per-ATS rate limits documented for these public endpoints, and 1-2 req/board/day is far below any radar. Add `User-Agent: metahunt-bot (contact email)`.
- Overlap SKIP + deterministic child workflow IDs (same pattern as RSS) → re-fires are safe.

## 6. Filtering policy (the main product decision)

Ingesting all 445 boards fully = ~30k jobs initial, mostly US-located, irrelevant to UA-focused users, and pure LLM cost. Options per board (store as per-source config):

- `all` — small boards & UA companies (Skelar, OBRIO, Quarks, Universe…): ingest everything.
- `ua-remote-eu` — big global boards (Stripe, OpenAI…): keep only jobs whose locations match UA cities **or** `isRemote`/location matches `Remote` + (EMEA|Europe|EU|Worldwide|Anywhere) patterns. Cheap regex at adapter level, *before* LLM.
- Title filter: reuse `isITVacancy` as-is (same blacklist/whitelist semantics; ATS boards include sales/HR roles too).

Recommended defaults: UA tier → `all`; REMOTE/GLOBAL tiers → `ua-remote-eu`. Aggregator-flagged boards (jobgether, tsmg, welo…) → **exclude in v1** (quality risk + they'd dominate volume; revisit deliberately).

Rough volume estimate with that policy: UA tier ≈ 2.3k jobs + filtered remote-EU slice of the rest ≈ 3-6k jobs initial backfill; steady state ≈ tens of new jobs/day. At current per-extraction cost (see `extraction_cost` view) this is the same order as existing RSS volume — no infra concern; backfill in one evening run.

## 7. Closed-job detection (free win, RSS can't do this)

Every ATS fetch is a **complete board snapshot**. After `atsParseAndStore`, diff: `SELECT external_id FROM vacancies WHERE source_id = $1 AND closed_at IS NULL` minus the snapshot's externalIds → mark `closed_at = now()`.

- New activity `atsMarkClosed(ingestId)` at the end of `atsIngestWorkflow`.
- Guard: only run when the fetch returned HTTP 200 *and* >0 jobs (a transient empty/failed payload must not mass-close a board; a real 0-job board gets closed on the next confirmed-200-empty cycle — accept 1-cycle lag).
- Downstream: feed/digest queries add `closed_at IS NULL`; `unique_vacancies` stays open while ≥1 member is open. This also derisks the digest: no more recommending dead links — a known RSS weakness.

## 8. Dedup interplay

- Same job will arrive from both Djinni/DOU (RSS) and the company's ATS board — this is the *target case* for the semantic dedup pipeline; nothing new needed mechanically: ATS vacancies flow into the same embed→resolve sweep.
- **It helps the Skelar boilerplate problem**: ATS jobs carry structural `department`/`team` (e.g. Ashby `team: "Affemity Group"`) — exactly the structural gate the dedup confidence-tier design wants. Store dept/team into `rss_records.category` now; wire into dedup gates when we next touch dedup.
- Company identity: ATS source = one company ⇒ insert `company_identifiers (source_id, '<board company name>') → company_id` once at source creation. Cleaner than RSS company-name strings.
- Canonical preference: when a group contains an ATS posting + aggregator postings, prefer the ATS one as canonical (direct apply URL, freshest state, salary). Small ranking tweak in resolve; can wait for v2.

## 9. Failure modes & lifecycle

| Failure | Handling |
|---|---|
| Board 404 (company churned ATS) | Existing retry (3×) → ingest `failed`. After N consecutive failures mark source inactive (`sources` needs nothing new — monitoring query over `rss_ingests` status streak; alert via monitoring service). Don't auto-close its vacancies — wait for manual confirm. |
| Slug renamed | Looks like 404. Fix = update `ats_slug`; vacancies keyed by `source_id` survive. |
| Empty/partial payload | §7 guard; hash-dedup makes re-ingest idempotent. |
| Schema drift (ATS changes JSON) | Adapter throws → ingest fails loudly; raw JSON retained in S3 for replay after adapter fix (same replay property the RSS XML snapshots give). |
| 429/5xx | Same Temporal retry policy; if an ATS ever rate-limits, drop worker activity concurrency — config-only fix. |

Slug discovery loop (growing past 445): the validated pipeline in this dir (`probe.py` + README prompt) is repeatable — quarterly agent run with "exclude already-known slugs" + validate + append. Optionally: a tiny admin endpoint `POST /admin/sources/ats {atsType, slug}` that probes before insert (reuses adapter), so adding a board found ad-hoc is one curl.

## 10. Observability

- `rss_ingests` rows already give per-ingest status/notes → existing monitoring service picks ATS sources up automatically once they're `sources` rows.
- Add to finalize note: `jobs_total / new / closed / filtered_out` per cycle — that's the per-board health signal (a UA-tier board going 0-new for a month = stale slug candidate).
- PostHog (dormant until key set): one `ats_ingest_completed` event mirroring whatever RSS emits — skip until the existing analytics initiative needs it.

## 11. Rollout phases

1. **P1 — schema + Ashby adapter** (UA tier is Ashby-heavy: skelar, universe-group, obrio, kissmyapps, welltech, solidgate, ruby-labs, preply, ideals, quarks-tech…). Sources seeded from `ats-slugs.tsv` UA tier. Validates the whole chain incl. closed-detection. ~1-1.5 days.
2. **P2 — Greenhouse + Lever adapters** (+ per-job content strategy for big boards). Completes UA tier (nix, innovecs, speechify; ajax, eleks, provectus, viseven, intellias, airslate). ~1 day.
3. **P3 — REMOTE tier with `ua-remote-eu` filter** + Recruitee adapter (macpaw, betterme). Volume knob: enable boards in batches, watch extraction cost. ~0.5 day + monitoring.
4. **P4 (later)** — SmartRecruiters/Workable if ever worth it; dedup canonical-preference tweak; BAML known-fields optimization; admin slug endpoint.

## 12. Open questions (need your call)

1. Filtering default for global boards: `ua-remote-eu` as proposed, or full-remote-worldwide too?
2. Aggregator boards (jobgether 4.8k jobs, toogeza, tsmg) — excluded in v1, agree?
3. Backfill scope for P1: all jobs currently on UA-tier boards (~2.3k) in one run, or trickle?
4. Is `todo/ats-sources/` the right home long-term, or move slugs into a DB seed migration at P1?
