# loader-pipeline — silver vacancies from RSS records

**Branch:** `feat/loader-pipeline` · **Closed:** 2026-05-05 · **Status:** done

## Outcome

T1–T18 shipped. Six new tables (`companies`, `company_identifiers`, `nodes`, `node_aliases`, `vacancies`, `vacancy_nodes`) + seven enums; `rss_records.external_id` derived per-source (Djinni/DOU) at parse time and locked `NOT NULL`; `vacancyPipelineWorkflow` fans out from `rssIngestWorkflow` (`ABANDON` child, deterministic id); `POST /loader/backfill` recovers stuck records. 99 unit tests + a self-contained smoke (`apps/etl/scripts/loader-smoke.ts`) green. Live schema in `libs/database/src/schema/`; live module in `apps/etl/src/loader/`.

## Goal

Per-vacancy pipeline workflow that loads a row in `vacancies` (silver) from each newly-extracted `rss_record`. The pipeline workflow is the unit of work for one vacancy after extraction. Today: one stage (loader). Future stages (dedup, telegram) plug in by appending activities — no workflow rewrite needed.

## Decisions (locked)

- **No `fingerprint_hash`**, no `vacancy_source` table, no `VacancyVersion`. Dedup is a separate initiative.
- **`vacancies.unique(source_id, external_id)`** is the identity key. `external_id` derived per-source via pure function at parse time; URLs that don't match the per-source extractor are dropped from bronze rather than poisoning the dedup key.
- **Unified `nodes` table** for `ROLE` / `SKILL` / `DOMAIN`. `is_required` on `vacancy_nodes` defaults `true` (only meaningful for `SKILL`; harmless `true` for the others).
- **`role_node_id` and `domain_node_id` as direct FKs** on `vacancies` (semantically one each); skills go through `vacancy_nodes` (M2M).
- **Strict alias matching only** — no fuzzy / no semantic at load time. Unknown nodes inserted with `status='NEW'` for later moderation. Fuzzy lives in the moderation tooling (→ [`taxonomy-curation`](../taxonomy-curation.md)).
- **Per-record child workflow** `vacancyPipelineWorkflow` started from `rssIngestWorkflow` with `parentClosePolicy: ABANDON` and deterministic `workflowId = vacancy-pipeline-{rssRecordId}`. `WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY` lets a failed pipeline retry on the next ingest pass.
- **Locations** stored as `vacancy.locations jsonb` (`[{city, country}]`) — no normalized table yet.
- **No moderation UI** in this initiative; the read-only admin endpoints + UI work landed under [`taxonomy-curation`](../taxonomy-curation.md).

## Scope (deferred to follow-on initiatives)

- Dedup workflow / `fingerprint_hash` / `vacancy_source` table / cross-source linking.
- Telegram notification (placeholder stage in pipeline noted, not implemented).
- `VacancyVersion` history (history lives in `rss_records`).
- Locations table.
- ltree node hierarchy, `node_links`, `node_vector` embeddings.

## Future stages (append-only on `vacancyPipelineWorkflow`)

- **`dedupVacancyWorkflow(vacancyId)`** — fingerprint or fuzzy matching across `(source, external_id)` pairs to link cross-source duplicates. Will introduce `vacancy_source` table and soft-delete merged duplicates. Fingerprint candidate: `sha256(company_id || ':' || normalized_title || ':' || primary_country)`.
- **`notifyVacancyWorkflow(vacancyId)`** — Telegram fan-out. Per-channel/per-user filter rules read from a future `notification_subscriptions` table.

## Key paths

- Schema: `libs/database/src/schema/{companies,company-identifiers,nodes,node-aliases,vacancies,vacancy-nodes}.ts`.
- Module: `apps/etl/src/loader/` (services, activities, workflows, controller).
- External-id extractors: `apps/etl/src/loader/external-id/extractors/{djinni,dou}.ts` + registry in `source-external-id.ts`.
- Smoke: `apps/etl/scripts/loader-smoke.ts`.
- Runbook: [`md/runbook/loader-pipeline-smoke.md`](../../../runbook/loader-pipeline-smoke.md).
