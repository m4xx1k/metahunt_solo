import { continueAsNew, log, proxyActivities } from "@temporalio/workflow";

import type { RefreshNodeStatsActivity } from "../../../01-ingest/rss/activities/refresh-node-stats.activity";
import type { RssExtractActivity } from "../../../01-ingest/rss/activities/rss-extract.activity";
import { settleInBatches } from "../../../workflows/settle-in-batches";
import type { LoadVacancyActivity } from "../../loader/activities/load-vacancy.activity";
import type { StalePostingsActivity } from "../activities/stale-postings.activity";

const SELECT_BATCH_SIZE = 50;
const EXTRACTION_BATCH_SIZE = 10;

export type ReextractInput = {
  /** ISO date; only Positions first loaded on or after it. Omitted = whole corpus. */
  since?: string;
  /** Stop after this many postings across all runs. Omitted = until none are stale. */
  maxPostings?: number;
  /** Carried across `continueAsNew`; callers leave it unset. */
  done?: number;
};

const { listStalePostings } = proxyActivities<typeof StalePostingsActivity.prototype>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { extractAndInsert } = proxyActivities<typeof RssExtractActivity.prototype>({
  startToCloseTimeout: "3m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { loadVacancy } = proxyActivities<typeof LoadVacancyActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 3, initialInterval: "5s", backoffCoefficient: 2 },
});

const { refreshNodeStats } = proxyActivities<typeof RefreshNodeStatsActivity.prototype>({
  startToCloseTimeout: "10m",
  retry: { maximumAttempts: 3, initialInterval: "10s", backoffCoefficient: 2 },
});

/**
 * Re-extract canonical postings the current contract has not produced yet, one
 * bounded batch per run (requirement-groups.md §7). Selection is newest-first
 * and re-runs the same query every batch, so a posting leaves the set as soon
 * as it succeeds and the run is resumable after any failure.
 *
 * `force` is required on the load: re-extraction reloads the record that is
 * already the listing's current version, which the freshness guard would
 * otherwise drop.
 */
export async function reextractWorkflow(input: ReextractInput = {}): Promise<void> {
  const done = input.done ?? 0;
  const remaining = input.maxPostings != null ? input.maxPostings - done : SELECT_BATCH_SIZE;
  if (remaining <= 0) {
    log.info(`Re-extraction finished: reached maxPostings=${String(input.maxPostings)}`);
    await refreshNodeStats();
    return;
  }

  const recordIds = await listStalePostings({
    since: input.since,
    limit: Math.min(SELECT_BATCH_SIZE, remaining),
  });
  if (recordIds.length === 0) {
    log.info(`Re-extraction finished: nothing stale left after ${done} posting(s)`);
    await refreshNodeStats();
    return;
  }

  const results = await settleInBatches(recordIds, EXTRACTION_BATCH_SIZE, async (recordId) => {
    await extractAndInsert(recordId);
    await loadVacancy(recordId, { force: true });
  });
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  const succeeded = recordIds.length - failures.length;
  if (failures.length > 0) {
    log.warn(`Re-extraction failed for ${failures.length}/${recordIds.length} posting(s)`, {
      firstError: String(failures[0].reason),
    });
  }

  // Every posting in the batch failed, and a failed posting stays selectable —
  // continuing would re-read the same rows forever.
  if (succeeded === 0) {
    throw new Error(
      `Re-extraction stalled: all ${recordIds.length} posting(s) in this batch failed`,
    );
  }

  await continueAsNew<typeof reextractWorkflow>({ ...input, done: done + succeeded });
}
