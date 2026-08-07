# Corpus snapshot

Provenance of the data currently loaded in `metahunt_lab`. Update this whenever
the lab is reloaded — every finding in `experiments/` is only interpretable
against a known corpus.

## Current snapshot

| | |
|---|---|
| Dump | `backups/Postgres-1786137672124.sql.gz` (249 MB gz) |
| Taken | 2026-08-07 from Railway prod (`Postgres` service, `pg_dump --no-owner --no-privileges`) |
| Restored into | `metahunt_lab` on `metahunt-db` (`localhost:54323`), 29 public tables |

## Baseline counts at restore time

Measured with `analytics/lab.sh`; these are the denominators to quote.

| Entity | Count |
|---|---|
| `vacancies` (raw rows) | 15,089 |
| `unique_vacancies` (post-dedup) | 12,763 |
| `vacancy_nodes` (vacancy ↔ node links) | 152,231 |
| — of those `is_required = true` | 102,981 (67.6%) |
| `nodes` type `SKILL` | 9,199 |
| `nodes` type `ROLE` | 225 |
| `nodes` type `DOMAIN` | 191 |
| `rss_records` (raw ingest payloads) | 23,004 |
| `companies` | 2,420 |

Corpus time span: `unique_vacancies.first_seen_at` **2026-05-01** through
`last_seen_at` **2026-08-07** — roughly three months. Treat any trend analysis
over a longer window as unsupported by the data, and check before trusting
within-window trends that the early weeks aren't a bulk backfill.

## Already-existing analytics objects

Two **materialized views** ship in the schema — pair/co-occurrence work is
partly built already, so audit these before rebuilding from scratch:

- `node_skill_cooc` — 86,442 rows
- `node_stats` — 7,975 rows

## Known shape notes

- `vacancy_nodes` carries `is_required` (boolean) as the must-have / nice-to-have
  signal. Whether it's stated in the vacancy text or inferred by the extractor is
  a question the audit must answer — it decides what Experiment D can claim.
- `unique_vacancies` has `source_count` and `vacancy_count`, so dedup ratio is
  directly measurable rather than estimated.
- `nodes` has a `status` column (taxonomy verification state); skill-frequency
  work needs to decide explicitly whether unverified nodes are in the
  denominator.
