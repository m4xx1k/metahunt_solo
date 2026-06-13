# Fix — Djinni `external_id` duplication

**Status:** open · **Found:** 2026-05-21 (while investigating a 3-member dedup group)

## Problem

~190 Djinni jobs exist as **two `vacancies` rows each**. The `(source_id, external_id)`
unique constraint does not catch them because the `external_id` *value* differs:

| row | external_id |
|---|---|
| old | `https://djinni.co/jobs/810172-senior-data-engineer/` (full URL) |
| new | `810172` (numeric job id) |

Same job, same `link`, two rows.

## Root cause

`apps/etl/src/loader/external-id/extractors/djinni.ts` derives the numeric job id
from the URL. That extractor was introduced in commit `57d42ea`
(*feat(loader): per-source external_id extractors*). **Before** that commit the loader
used the full URL/guid as `external_id`.

The format change shipped **without a data migration**. Every Djinni job that was
ingested both before and after `57d42ea` got re-inserted as a NEW row under the
numeric `external_id` — the upsert key no longer matched the old URL-form row.

## Evidence (DB, 2026-05-21)

- Djinni `external_id`: 1341 numeric + 1031 URL.
- 184 Djinni `link`s map to >1 vacancy row (368 rows involved).
- ~191 URL-form rows have a numeric-form twin.
- DOU not affected — its `external_id` format never changed.

## Impact

- `vacancies` count inflated by ~190 (3628 → real unique ≈ 3438).
- Dedup forms 3-member groups (2 Djinni phantoms + 1 DOU twin) instead of 2.
  Dedup itself is correct — it only surfaces the pre-existing corruption.

## Not recurring

The extractor is now consistently numeric — new ingests upsert fine. This is a
purely historical straddle of commit `57d42ea`.

## Proposed fix (one-off cleanup)

1. For each Djinni URL-form row that has a numeric-form twin (~191): the numeric
   row is the fresher ingest — **delete the stale URL-form row** and its
   `vacancy_nodes`.
2. URL-form rows **without** a numeric twin (~840) are unique jobs — leave them.
3. `pnpm dedup:reset` + `pnpm dedup:resolve` — groups and canonicals rebuild from
   scratch, so no manual FK repointing of `unique_vacancies.canonical_vacancy_id`.
4. Embeddings live on the surviving rows — no re-embed needed.

Optional: also normalise stale `rss_records.external_id` (same split exists there),
lower priority — it does not drive the vacancy unique key.

## Open question

Match URL-row ↔ numeric-row by the numeric id embedded in the URL
(`/jobs/(\d+)-`), or by `rss_records.link` equality? The id-in-URL match is more
direct and does not depend on `last_rss_record_id` being set.
