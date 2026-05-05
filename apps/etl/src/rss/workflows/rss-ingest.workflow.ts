import {
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
  WorkflowIdReusePolicy,
} from "@temporalio/workflow";
import type { RssFetchActivity } from "../activities/rss-fetch.activity";
import type { RssParseActivity } from "../activities/rss-parse.activity";
import type { RssExtractActivity } from "../activities/rss-extract.activity";
import type { RssFinalizeActivity } from "../activities/rss-finalize.activity";

const { fetchAndStore } = proxyActivities<typeof RssFetchActivity.prototype>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { parseAndDedup } = proxyActivities<typeof RssParseActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { extractAndInsert } = proxyActivities<
  typeof RssExtractActivity.prototype
>({
  startToCloseTimeout: "3m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { finalizeIngest } = proxyActivities<
  typeof RssFinalizeActivity.prototype
>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 5, initialInterval: "2s", backoffCoefficient: 2 },
});

export async function rssIngestWorkflow(sourceId: string): Promise<void> {
  const ingestId = await fetchAndStore(sourceId);
  try {
    const newItemIds = await parseAndDedup(ingestId);

    // Per-record extraction is best-effort: one bad vacancy (e.g. an LLM that
    // muffs the schema) must not fail the surrounding good records. Activity
    // already retries 3× internally; we collect the outcomes and only count
    // the failures into the finalize note.
    const results = await Promise.allSettled(
      newItemIds.map((id) => extractAndInsert(id)),
    );
    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failures.length > 0) {
      log.warn(
        `Extraction failed for ${failures.length}/${newItemIds.length} record(s); ingest still finalizing as completed.`,
        { firstError: String(failures[0].reason) },
      );
    }

    // Fan out the silver-layer pipeline per successfully extracted record.
    // Children run with ABANDON parent-close so this ingest workflow can
    // finish without waiting on (potentially slow) per-vacancy load chains.
    // Deterministic workflowId per rss_record_id makes a re-fired ingest
    // safe — Temporal rejects duplicates by default. ALLOW_DUPLICATE_FAILED_ONLY
    // lets a failed pipeline be retried by the next ingest pass without
    // blocking the happy path.
    const successfulIds = newItemIds.filter(
      (_, i) => results[i].status === "fulfilled",
    );
    const childResults = await Promise.allSettled(
      successfulIds.map((rssRecordId) =>
        startChild("vacancyPipelineWorkflow", {
          args: [rssRecordId],
          workflowId: `vacancy-pipeline-${rssRecordId}`,
          parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy:
            WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
        }),
      ),
    );
    const childFailures = childResults.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (childFailures.length > 0) {
      log.warn(
        `Failed to start ${childFailures.length}/${successfulIds.length} pipeline child workflow(s); ingest finalizing.`,
        { firstError: String(childFailures[0].reason) },
      );
    }

    const note =
      failures.length > 0
        ? `extracted=${newItemIds.length - failures.length}/${newItemIds.length} (failures=${failures.length})`
        : undefined;
    await finalizeIngest(ingestId, "completed", note);
  } catch (err) {
    await finalizeIngest(
      ingestId,
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
