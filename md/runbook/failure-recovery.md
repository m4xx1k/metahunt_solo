# RSS ingest — failure recovery

**Use when:** a workflow run failed in Temporal UI, or rows in `rss_ingests` show `status='failed'`.

The pipeline runs as `rssIngestAllWorkflow` (parent, started by Temporal Schedule `rss-ingest-hourly`) → one `rssIngestWorkflow` child per source → activities `fetchAndStore` → `parseAndDedup` → `extractAndInsert` (per-record, best-effort) → `finalizeIngest`.

Every activity retries 3× with 5s/10s/20s exponential backoff; only `finalizeIngest` retries 5× (idempotent and critical). When a non-final activity exhausts retries, the child workflow catches the error, calls `finalizeIngest(ingestId, "failed", errorMessage)`, then re-throws — so the workflow ends `Failed` AND the `rss_ingests` row is `status='failed'` with the cause in `error_message`.

## Triage — where did it die?

1. Open Temporal UI → Workflows → filter `WorkflowType="rssIngestWorkflow"` and `ExecutionStatus="Failed"`. Click in.
2. The "History" tab shows the activity timeline; the failed activity is highlighted red. Note its name.
3. Cross-check Postgres:
   ```sql
   SELECT id, source_id, status, error_message, started_at, finished_at, payload_storage_key
     FROM rss_ingests
     WHERE workflow_run_id = '<runId from Temporal UI>';
   ```

The recovery procedure depends on which activity failed.

---

## A. `fetchAndStore` failed — RSS not fetched

**Symptoms:** `rss_ingests.status='failed'`, `payload_storage_key` is NULL, `error_message` mentions HTTP/TCP/network or "Fallback RSS file not found".

**Common causes:**
- Source RSS endpoint down (Djinni/DOU 5xx).
- Outbound network blocked (firewall, DNS).
- S3 / R2 unreachable on upload after fetch.
- In dev, no fallback file at `apps/etl/data/rss/<code>-rss.xml`.

**Diagnose:**
```bash
# From the ETL pod / local box:
curl -I https://djinni.co/jobs/rss/                         # is the source up?
curl -I "$STORAGE_ENDPOINT/$STORAGE_BUCKET"                 # S3/R2 reachable?
railway logs --deployment <ID> --lines 200 | grep RssFetch
```

**Restore:**

1. Wait. If the RSS host had a blip, the next scheduled run (top of the next hour in 06:00–22:00 Europe/Kyiv) will pick up new items via hash dedup — nothing is lost permanently because feed publishers keep recent items in the feed window.
2. To force an immediate retry without waiting:
   - **Temporal UI**: Schedules → `rss-ingest-hourly` → **Trigger**.
   - Or from CLI: `temporal schedule trigger --schedule-id rss-ingest-hourly`.
3. To rerun a *specific* failed workflow (re-fetch the same source, bypassing the schedule):
   ```bash
   curl -X GET https://<host>/rss   # fires ingestAll() — every source, including failed one
   ```
   Or call `RssSchedulerService.ingestRemote()` programmatically in a one-shot script.
4. Persistent host outage → in `.env` add the source's RSS XML to `apps/etl/data/rss/<code>-rss.xml` so the activity falls back to file. Already used for local dev.

**No DB cleanup needed.** A failed `rss_ingests` row is informational. The next successful ingest writes a *new* row; old failed rows are kept as audit trail. To prune them later: `DELETE FROM rss_ingests WHERE status='failed' AND started_at < now() - interval '30 days';`

---

## B. `parseAndDedup` failed — DB unreachable, or XML malformed

**Symptoms:** `rss_ingests.status='failed'`, `payload_storage_key` is **set** (XML uploaded), `error_message` mentions DB / connection / parse.

**Common causes:**
- Postgres down or connection limit hit.
- `pgvector` extension or migration missing.
- XML schema drift (source changed shape) — `fast-xml-parser` throws.

**Diagnose:**
```bash
psql "$DATABASE_URL" -c "SELECT 1;"                          # DB reachable?
psql "$DATABASE_URL" -c "SELECT count(*) FROM rss_records;"  # schema OK?
# Pull the XML from storage to inspect parser errors:
aws --endpoint-url "$STORAGE_ENDPOINT" s3 cp \
  "s3://$STORAGE_BUCKET/rss/<sourceId>/<ingestId>.xml" - | head -50
```

**Restore:**

- **DB transient failure** — once `psql -c 'SELECT 1'` returns clean, just trigger the schedule (`Trigger` button in Temporal UI) or `curl /rss`. The XML is already stored, but re-running goes through `fetchAndStore` again (idempotent — it inserts an `rss_ingests` row keyed by `workflow_run_id` with `onConflictDoNothing`). The new run will re-fetch + re-dedup; dedup is hash-based so already-inserted records are skipped automatically.
- **DB schema drift** — apply the missing migration (`pnpm db:migrate` locally; on Railway, the pre-deploy migration step runs on each deploy — re-deploy is the lever). Then trigger.
- **XML schema drift** — fix `RssParserService` for the new shape, ship a deploy, then trigger.

**No manual DB cleanup needed** — dedup is idempotent. The failed `rss_ingests` row stays as audit; the new run writes a fresh row.

---

## C. `extractAndInsert` failed — LLM extraction error

**Important:** as of 2026-05-03, extraction is **per-record best-effort**. A single record's failure does NOT fail the surrounding `rssIngestWorkflow`. The workflow uses `Promise.allSettled` and finalizes as `completed` with a note in `rss_ingests.error_message` of the form `extracted=X/Y (failures=N)`. The whole workflow only fails if 100% of records reject in a way that bypasses the per-record boundary (rare — e.g. `VACANCY_EXTRACTOR` provider misconfigured, throwing on every call).

**Symptoms (per-record):** `rss_records.extracted_at IS NULL` for some rows; the `rss_ingests` row says `status='completed'` with `error_message` like `extracted=43/47 (failures=4)`. Workflow itself: `Completed`, but with `WARN` in worker logs.

**Symptoms (catastrophic):** all-record failure → workflow `Failed`. Usually means `EXTRACTOR_PROVIDER=baml` but `OPENAI_API_KEY` is missing, or BAML schema incompatible with model output.

**Diagnose:**
```sql
-- Records that didn't extract in the last 24h
SELECT id, source_id, title, created_at
  FROM rss_records
  WHERE extracted_at IS NULL
    AND created_at > now() - interval '24 hours'
  ORDER BY created_at DESC;
```

Worker log search:
```bash
railway logs --deployment <ID> --lines 500 | grep -A 20 "BamlValidationError"
```

**Restore:**

- **Single-record failures (typical)** — hit the backfill endpoint:
  ```bash
  # local
  curl -X POST "http://localhost:3000/rss/extract-missing?limit=100"
  # railway
  curl -X POST "https://<host>/rss/extract-missing?limit=100"
  ```
  Returns `{ attempted, succeeded, failed }`. Iterates `rss_records WHERE extracted_at IS NULL` ordered oldest-first, calls `extractAndInsert` per record in-process (bypasses Temporal). Capped at `?limit=` (default 100, max 500) to avoid HTTP timeouts; re-run until `attempted=0`. Useful when the prior workflow inserted records via `parseAndDedup` but extraction never ran or failed before writing — dedup skips them on re-trigger so the schedule alone won't fix them.
- **Catastrophic provider failure** — check env: `EXTRACTOR_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Set `EXTRACTOR_PROVIDER=placeholder` to keep the pipeline flowing while you fix BAML, then revert. Each schedule firing will mark new records `extracted_at` with the placeholder shape — they're still re-extractable later because the placeholder writes deterministic data.
- **BAML schema mismatch** (LLM nests required fields, etc.) — change the field to optional in `apps/etl/baml_src/extract-vacancy.baml` (`bool?`, `string?`), re-run `pnpm --filter @metahunt/etl baml:generate`, deploy. Done once on 2026-05-03 for `hasTestAssignment` / `hasReservation`.

---

## Re-running a single ended workflow

Temporal does not "resume" failed workflows by design (deterministic replay needs a clean slate). To rerun the same input:

- **Reset to a point** (rare, advanced) — Temporal UI → Workflow → "Reset" to a specific event id; the workflow re-executes from there with the new code. Useful when you've shipped a bug fix and want the *same* workflow id to re-run without changing schedule state.
- **Just start a new one** (typical) — `curl /rss` or `temporal schedule trigger --schedule-id rss-ingest-hourly`. Dedup is hash-based so duplicate work is cheap.

## Pausing the schedule (incident response)

If extraction is broken or DB is unhealthy and you want to stop new runs from piling up:

```bash
temporal schedule pause   --schedule-id rss-ingest-hourly --reason "incident #X"
# fix the issue, then:
temporal schedule unpause --schedule-id rss-ingest-hourly
```

Or via Temporal UI → Schedules → `rss-ingest-hourly` → **Pause**.

The schedule is also automatically paused if `pauseOnFailure: true`, but we don't currently set that — every schedule firing kicks off a new attempt regardless of prior failures. Set it via `handle.update` if you want stricter behavior.
