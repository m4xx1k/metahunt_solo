import { proxyActivities } from "@temporalio/workflow";

import type { DedupSweepActivity } from "../activities/dedup-sweep.activity";

// Generous timeout: the first run embeds + resolves the whole corpus; steady
// state only touches the delta (embed/resolve both skip already-processed
// rows), so subsequent fires are quick. Idempotent → a retry just re-skips.
const { dedupSweep } = proxyActivities<typeof DedupSweepActivity.prototype>({
  startToCloseTimeout: "30m",
  retry: { maximumAttempts: 2, initialInterval: "30s", backoffCoefficient: 2 },
});

export async function dedupSweepWorkflow(): Promise<void> {
  await dedupSweep();
}
