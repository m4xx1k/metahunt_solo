import {
  log,
  ParentClosePolicy,
  proxyActivities,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";
import type { RefreshNodeStatsActivity } from "../activities/refresh-node-stats.activity";
import type { RssListSourcesActivity } from "../activities/rss-list-sources.activity";

const { listRemoteSources } = proxyActivities<
  typeof RssListSourcesActivity.prototype
>({
  startToCloseTimeout: "30s",
  retry: { maximumAttempts: 3 },
});

const { refreshNodeStats } = proxyActivities<
  typeof RefreshNodeStatsActivity.prototype
>({
  startToCloseTimeout: "5m",
  retry: { maximumAttempts: 2 },
});

// `2026-05-03T14-29-13Z` — ISO 8601 with colons/dots flattened to dashes so
// the resulting workflowId stays readable in the Temporal UI without making
// shells choke on the `:` separator.
function formatStamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
}

export async function rssIngestAllWorkflow(): Promise<{ started: number }> {
  const sources = await listRemoteSources();
  if (sources.length === 0) return { started: 0 };

  // Use the workflow's own start time so every child in this run shares one
  // timestamp; the schedule already appends a unique time-suffix to the
  // parent workflowId, so collisions across schedule firings are impossible.
  const stamp = formatStamp(workflowInfo().startTime);

  await Promise.all(
    sources.map((src) =>
      startChild("rssIngestWorkflow", {
        args: [src.id],
        workflowId: `rss-ingest-${src.code}-${stamp}`,
        parentClosePolicy: ParentClosePolicy.ABANDON,
      }),
    ),
  );

  // Refresh the reverse-ATS IDF view so new vacancies' skills enter df/weight.
  // Best-effort: a refresh failure must not fail the ingest, and because the
  // per-vacancy loads are ABANDON children, this picks up prior committed runs
  // (≤1-cycle lag — acceptable for IDF stats). See RefreshNodeStatsActivity.
  try {
    await refreshNodeStats();
  } catch (err) {
    log.warn(`node_stats refresh failed; will retry next ingest: ${String(err)}`);
  }

  return { started: sources.length };
}
