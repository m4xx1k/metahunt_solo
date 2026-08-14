import { BackupAlertActivity } from "../backup-alert.activity";
import { DbBackupActivity } from "../db-backup.activity";

export { BackupAlertActivity, DbBackupActivity };

// Single source of truth for the activity classes wired into both the Temporal
// worker (`activityClasses`) and the Nest module (`providers`).
export const BACKUP_ACTIVITIES = [DbBackupActivity, BackupAlertActivity] as const;
