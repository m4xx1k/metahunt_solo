import {
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
  workflowInfo,
  WorkflowIdReusePolicy,
} from "@temporalio/workflow";

import { settleInBatches } from "../../../workflows/settle-in-batches";
import type { RssExtractActivity } from "../activities/rss-extract.activity";
import type { RssFetchActivity } from "../activities/rss-fetch.activity";
import type { RssFinalizeActivity } from "../activities/rss-finalize.activity";
import type { RssParseActivity } from "../activities/rss-parse.activity";

const EXTRACTION_BATCH_SIZE = 10;
const CHILD_START_BATCH_SIZE = 25;

const { fetchAndStore } = proxyActivities<typeof RssFetchActivity.prototype>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { parseAndDedup } = proxyActivities<typeof RssParseActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { extractAndInsert } = proxyActivities<typeof RssExtractActivity.prototype>({
  startToCloseTimeout: "3m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { finalizeIngest, finalizeIngestByWorkflowRunId } = proxyActivities<
  typeof RssFinalizeActivity.prototype
>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 5, initialInterval: "2s", backoffCoefficient: 2 },
});

export async function rssIngestWorkflow(sourceId: string): Promise<void> {
  const workflowRunId = workflowInfo().runId;
  try {
    const ingestId = await fetchAndStore(sourceId);
    const newItemIds = await parseAndDedup(ingestId);

    // Records fail independently after activity retries; one malformed record
    // must not block valid records from progressing.
    const results = await settleInBatches(newItemIds, EXTRACTION_BATCH_SIZE, (id) =>
      extractAndInsert(id),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length > 0) {
      log.warn(
        `Extraction failed for ${failures.length}/${newItemIds.length} record(s); ingest still finalizing as completed.`,
        { firstError: String(failures[0].reason) },
      );
    }

    // ABANDON lets ingest finalize without waiting; deterministic IDs make
    // replay idempotent while allowing a failed child to be retried.
    const successfulIds = newItemIds.filter((_, i) => results[i].status === "fulfilled");
    const childResults = await settleInBatches(
      successfulIds,
      CHILD_START_BATCH_SIZE,
      (rssRecordId) =>
        startChild("vacancyPipelineWorkflow", {
          args: [rssRecordId],
          workflowId: `vacancy-pipeline-${rssRecordId}`,
          parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE_FAILED_ONLY,
        }),
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
    await finalizeIngestByWorkflowRunId(
      workflowRunId,
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
