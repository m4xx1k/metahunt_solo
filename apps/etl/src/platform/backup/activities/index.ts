import { DbBackupActivity } from "../db-backup.activity";

export { DbBackupActivity };

// Single source of truth for the activity classes wired into both the Temporal
// worker (`activityClasses`) and the Nest module (`providers`).
export const BACKUP_ACTIVITIES = [DbBackupActivity] as const;
