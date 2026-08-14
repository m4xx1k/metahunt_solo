import { proxyActivities } from "@temporalio/workflow";

import type { DbBackupActivity } from "../db-backup.activity";

const { backupDatabase } = proxyActivities<typeof DbBackupActivity.prototype>({
  startToCloseTimeout: "30m",
  retry: { maximumAttempts: 3 },
});

// No try/catch on purpose: a swallowed failure here is what let the market
// snapshots fill the volume unnoticed. Let the workflow fail and stay visible.
export async function dbBackupWorkflow(): Promise<{ key: string; bytes: number }> {
  return backupDatabase();
}
