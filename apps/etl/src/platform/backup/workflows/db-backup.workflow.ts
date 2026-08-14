import { proxyActivities } from "@temporalio/workflow";

import type { BackupAlertActivity } from "../backup-alert.activity";
import type { DbBackupActivity } from "../db-backup.activity";

const { backupDatabase } = proxyActivities<typeof DbBackupActivity.prototype>({
  startToCloseTimeout: "30m",
  retry: { maximumAttempts: 3 },
});

const { alertBackupFailed } = proxyActivities<typeof BackupAlertActivity.prototype>({
  startToCloseTimeout: "1m",
  retry: { maximumAttempts: 3 },
});

// The catch alerts and rethrows rather than swallowing: a failed backup must
// both reach a human and leave the workflow red in Temporal.
export async function dbBackupWorkflow(): Promise<{ key: string; bytes: number; pruned: number }> {
  try {
    return await backupDatabase();
  } catch (err) {
    await alertBackupFailed(String(err));
    throw err;
  }
}
