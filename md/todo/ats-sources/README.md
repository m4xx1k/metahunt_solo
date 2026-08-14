# ATS job-board sources — validated slugs

## Local MET-54 viewer (safe POC path)

`/ats` is an operator review surface for source postings, not the public deduplicated feed. It runs through the standalone ATS API (not the regular ETL app), keeps closed postings visible on demand, and reports field/board health.

From `feat/MET-54-ats-poc`, a clean local start is:

```bash
cp -n .env.poc.example .env              # only creates it in a fresh POC worktree
cp -n apps/web/ats-poc.env.example apps/web/.env.local
docker compose -f compose.poc.yaml up -d
pnpm db:migrate
pnpm ats:poc:demo-seed                   # optional; no network or LLM spend
pnpm ats:poc:api                         # terminal 1: http://localhost:3399
pnpm dev:web                             # terminal 2: http://localhost:4000
```

Open [http://localhost:4000/ats](http://localhost:4000/ats). `demo-seed` is idempotent and inserts only `ats:demo:local-review`: four postings covering annual salary, remote/hybrid, closed, and missing-field review states. It never calls an ATS API or an LLM. If a local POC dump is already present, skip it — the seed is additive.

Do **not** use `ats-poc-pipeline ingest` or `extract` as a start command: `ingest` touches hundreds of external boards and `extract` consumes the LLM budget. Both remain for verdict/replay and need explicit scope/budget approval. `docker compose -f compose.poc.yaml down` stops the isolated DB; add `-v` only when intentionally deleting POC data.

API: `GET /ats/jobs` (`q`, `status=open|closed|all`, `uaOnly`, `remoteOnly`, `reviewOnly`, `limit`, `offset`) and `GET /ats/overview`. A failed API request is deliberately rendered as an error, never as an empty corpus. On a future approved ingest, a successful non-empty board snapshot closes only postings absent from that snapshot and reopens postings that return; failed or empty snapshots do neither.

## Paused status — 2026-07-28

**Verdict: pause this POC; it is inspectable, not product-ready.** The local UI/API, demo seed, salary-period presentation and snapshot lifecycle code exist in `feat/MET-54-ats-poc`. The corpus currently has 5,263 loaded jobs from 272 non-empty boards (419 configured boards); 148 boards have no imported jobs. Data is broad and noisy rather than deliberately valuable: location and original-URL coverage are high, but work-mode coverage is ~86%, structured salary ~47%, real closed-job history is not yet established, and semantic dedup has not been run.

**Priority on return:** high-quality direct vacancies for **Ukraine first, then Europe/remote-Europe**. Do not resume with a global-board backfill, a “more jobs” target, or paid extraction. Start with a small, manually curated allowlist of top UA/EU product companies; fetch snapshots only, validate live URLs/locations/work mode and closure behaviour, then decide which boards deserve extraction. Keep aggregators excluded.

**Do not forget:** the current `status=closed` UI is proven with safe demo data; actual lifecycle evidence needs two approved snapshots of the same curated boards. The next work should be quality/ranking policy and a board allowlist, not more dashboard polish.

Generated 2026-06-12. 458 validated boards (jobs > 0), ~31k jobs total, ~800 UA-located, ~14k remote.
Full list: [`ats-slugs.tsv`](ats-slugs.tsv) — columns: `tier, ats, slug, company, jobs, ua_jobs, remote_jobs, flag`.

Tiers: **UA** = has Ukraine-located jobs (51 boards), **REMOTE** = ≥30% remote share (≈185), **GLOBAL** = the rest.
`flag=aggregator` — job aggregator / recruiting agency board (Jobgether, TSMG, Toogeza, Welo…): many jobs, mixed quality, decide separately.
`flag=name-collision?` — slug exists but probably a different company than the name suggests (e.g. `ashby/genesis`, `ashby/ajax` are NOT the Ukrainian ones).

## API endpoints (validated, no auth needed)

| ATS | Endpoint | Hit/miss | Notes |
|---|---|---|---|
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true` | 200 / 404 | `jobs[]`: `location`, `secondaryLocations[]`, `isRemote`, `workplaceType`, `descriptionHtml`, `compensation`. Slug case-insensitive. |
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true` | 200 / 404 | `jobs[]`: `location.name`, `absolute_url`, `updated_at`; `?content=true` adds description + departments. Per-job: `/jobs/<id>`. |
| Lever | `https://api.lever.co/v0/postings/<slug>?mode=json` | 200 / 404 | array: `categories.location/team/commitment`, `allLocations[]`, `workplaceType`, `descriptionPlain`, `lists[]`. |
| Workable | `https://apply.workable.com/api/v1/widget/accounts/<slug>` | 200 / 404 | `jobs[]`: `city`, `country`, `telecommuting`. Widget API, no description; full posting needs per-job fetch. Many stale 0-job accounts (company moved ATS). |
| Recruitee | `https://<slug>.recruitee.com/api/offers/` | 200 / 404 | `offers[]`: `location`, `country`, `remote`, `description` (html), `careers_url`. |
| SmartRecruiters | `https://api.smartrecruiters.com/v1/companies/<slug>/postings?limit=100` | **always 200** | miss = `totalFound: 0`. Paginated (`offset`). Job detail: `…/postings/<id>`. |

Not probeable without auth/keys: Teamtailor (API key per company), BambooHR (302 redirects), Personio (per-tenant XML), PeopleForce (popular among UA companies — Uklon/MEGOGO-style careers pages, no public JSON found).

## UA tier (top)

| ats | slug | company | jobs | ua | remote | flag |
|---|---|---|---|---|---|---|
| ashby | `skelar` | Skelar | 169 | 155 | 135 |  |
| lever | `ajax` | Ajax Systems | 213 | 104 | 80 |  |
| greenhouse | `nix` | N-iX | 195 | 63 | 0 |  |
| ashby | `preply` | Preply | 146 | 35 | 146 |  |
| ashby | `ruby-labs` | Ruby Labs | 42 | 31 | 42 |  |
| greenhouse | `speechify` | Speechify | 1503 | 26 | 19 |  |
| ashby | `holywater` | HolyWater | 28 | 27 | 28 |  |
| ashby | `kissmyapps` | Kiss My Apps | 26 | 26 | 26 |  |
| ashby | `universe-group` | Universe Group | 28 | 22 | 21 |  |
| greenhouse | `squad` | SQUAD | 22 | 21 | 13 |  |
| recruitee | `brainstack` | Brainstack | 19 | 19 | 19 |  |
| ashby | `swarmer` | Swarmer | 22 | 12 | 21 |  |
| greenhouse | `justanswer` | JustAnswer | 16 | 8 | 0 |  |
| smartrecruiters | `playtech` | Playtech | 114 | 21 | 11 |  |
| ashby | `obrio` | OBRIO | 20 | 20 | 20 |  |
| ashby | `welltech` | Welltech | 20 | 17 | 20 |  |
| greenhouse | `innovecs` | Innovecs | 20 | 15 | 11 |  |
| recruitee | `macpaw` | MacPaw | 14 | 14 | 13 |  |
| lever | `eleks` | ELEKS | 23 | 13 | 21 |  |
| ashby | `solidgate` | Solidgate | 51 | 12 | 21 |  |
| ashby | `ideals` | Ideals | 46 | 8 | 40 |  |
| ashby | `clickup` | Clickup | 64 | 7 | 64 |  |
| ashby | `Liven` | Liven | 7 | 7 | 5 |  |
| lever | `provectus` | Provectus | 26 | 6 | 26 |  |
| lever | `viseven` | Viseven | 20 | 6 | 20 |  |
| ashby | `quarks-tech` | Quarks Tech | 10 | 6 | 7 |  |
| ashby | `n8n` | n8n | 39 | 5 | 39 |  |
| lever | `intellias` | Intellias | 7 | 4 | 4 |  |
| recruitee | `betterme` | BetterMe | 4 | 4 | 3 |  |
| lever | `airslate` | airSlate | 16 | 3 | 14 |  |
| + aggregators | `tsmg`(lever), `toogeza`(ashby), `remofirst`(lever), `weloglobal`(lever) | | | | | aggregator |

Notable misses (use own ATS / PeopleForce — no public JSON): Grammarly (own), Readdle, Jooble, Uklon, Creatio, MEGOGO, Rozetka, SoftServe, EPAM, Ciklum (jobs.ciklum.com), monobank/Fintech Band, Reface. Workable accounts `grammarly`, `readdle`, `uklon`, `jooble`, `creatio`, `megogo`, `petcube`, `gunzilla`, `epam`, `softserve`, `luxoft`, `ciklum`, `wix`, `namecheap` + most UA outsourcers exist but are empty (stale).
On **Teamtailor** (no public API without per-company key — possible v2 via HTML/JSON-LD scrape of `<slug>.teamtailor.com`): Headway-UA (`headway`), GlobalLogic (`globallogic`), Evoplay (`evoplay`), EveryMatrix (`everymatrix`), Avenga (`avenga`), Levi9 (`levi9`).

## How this was built (pipeline, reusable)

1. Seed candidate names (UA product/outsource cos + global remote-friendly) + web-harvest real slugs from `site:jobs.ashbyhq.com`, `site:boards.greenhouse.io`, `site:jobs.lever.co`, HN "Who is hiring".
2. Generate slug variants per name: `nospace`, `dash-case`, `first-word`.
3. Probe all (ats × slug) pairs concurrently against the endpoints above; record `total/ua/remote` job counts.
4. Merge, dedupe by `(ats, lower(slug))`, tier, rank by `ua*100 + remote + jobs*0.05`.

Scripts (in `/tmp/ats/`, copy here if needed long-term): `probe.py` (concurrent prober, stdin TSV `ats\tslug\tname` → stdout hits), `merge.py`, `curate.py`.

## Reusable prompt (to find more slugs)

```
You are hunting for ATS job-board slugs. A slug is the company identifier in public ATS APIs:
- Ashby: api.ashbyhq.com/posting-api/job-board/<slug>
- Greenhouse: boards-api.greenhouse.io/v1/boards/<slug>/jobs
- Lever: api.lever.co/v0/postings/<slug>?mode=json
- Workable: apply.workable.com/api/v1/widget/accounts/<slug>
- Recruitee: <slug>.recruitee.com/api/offers/
- SmartRecruiters: api.smartrecruiters.com/v1/companies/<slug>/postings (miss = totalFound:0)

Find N new slugs for companies matching: <CRITERIA — e.g. "hiring in Ukraine or remote-EU, product tech">.
Methods: (1) web search site:jobs.ashbyhq.com / site:boards.greenhouse.io / site:job-boards.greenhouse.io /
site:jobs.lever.co / site:apply.workable.com / site:*.recruitee.com with varied keyword queries;
(2) HN "Who is hiring" threads; (3) DOU.ua / Forbes-UA company ratings, then per-company careers-page
inspection to detect the ATS; (4) "powered by <ATS>" customer lists.
Extract slugs EXACTLY from URLs. Output machine-readable TSV: ats<TAB>slug<TAB>company.
Validate by hitting the API (200 + jobs array = hit); count jobs with location matching
Ukraine|Kyiv|Lviv|Kharkiv|Dnipro|Odesa and remote flags. Exclude already-known slugs: <attach list>.
```
