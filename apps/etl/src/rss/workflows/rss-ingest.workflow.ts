import { proxyActivities } from "@temporalio/workflow";
import type { RssFetchActivity } from "../activities/rss-fetch.activity";
import type { RssParseActivity } from "../activities/rss-parse.activity";
import type { RssExtractActivity } from "../activities/rss-extract.activity";
import type { RssFinalizeActivity } from "../activities/rss-finalize.activity";

const { fetchAndStore } = proxyActivities<typeof RssFetchActivity.prototype>({
  startToCloseTimeout: "2m",
  retry: { maximumAttempts: 3 },
});

const { parseAndDedup } = proxyActivities<typeof RssParseActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 2 },
});

const { extractAndInsert } = proxyActivities<
  typeof RssExtractActivity.prototype
>({
  startToCloseTimeout: "3m",
  retry: { maximumAttempts: 2, initialInterval: "5s" },
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
    await Promise.all(newItemIds.map((id) => extractAndInsert(id)));
    await finalizeIngest(ingestId, "completed");
  } catch (err) {
    await finalizeIngest(
      ingestId,
      "failed",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
