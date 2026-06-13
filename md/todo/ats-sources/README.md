# ATS job-board sources — validated slugs

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
