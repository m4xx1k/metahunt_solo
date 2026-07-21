import {
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";

import { settleInBatches } from "../../../workflows/settle-in-batches";
import type { RefreshNodeStatsActivity } from "../activities/refresh-node-stats.activity";
import type { RssListSourcesActivity } from "../activities/rss-list-sources.activity";

const SOURCE_START_BATCH_SIZE = 5;

const { listRemoteSources } = proxyActivities<typeof RssListSourcesActivity.prototype>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3 },
});

const { refreshNodeStats } = proxyActivities<typeof RefreshNodeStatsActivity.prototype>({
  startToCloseTimeout: "5m",
  retry: { maximumAttempts: 2 },
});

// Flatten separators so workflow IDs stay readable and shell-safe.
function formatStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z");
}

export async function rssIngestAllWorkflow(): Promise<{ started: number }> {
  const sources = await listRemoteSources();
  if (sources.length === 0) return { started: 0 };

  // Workflow start time gives every child one deterministic run stamp.
  const stamp = formatStamp(workflowInfo().startTime);

  const childResults = await settleInBatches(sources, SOURCE_START_BATCH_SIZE, (src) =>
    startChild("rssIngestWorkflow", {
      args: [src.id],
      workflowId: `rss-ingest-${src.code}-${stamp}`,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    }),
  );
  const failedStarts = childResults.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedStarts.length > 0) {
    log.warn(
      `Failed to start ${failedStarts.length}/${sources.length} source ingest workflow(s).`,
      {
        firstError: String(failedStarts[0].reason),
      },
    );
  }

  // Stats are eventually consistent and may lag abandoned listing children by one cycle.
  try {
    await refreshNodeStats();
  } catch (err) {
    log.warn(`node_stats refresh failed; will retry next ingest: ${String(err)}`);
  }

  return { started: sources.length - failedStarts.length };
}
