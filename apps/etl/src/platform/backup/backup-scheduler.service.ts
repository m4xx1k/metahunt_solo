import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  type ScheduleOptions,
} from "@temporalio/client";
import { TemporalService } from "nestjs-temporal-core";

const SCHEDULE_ID = "db-backup";
// Sundays 02:00 UTC — outside the 03:00-19:00 ingest window, so the dump sees
// a quiet database.
const CRON = "0 2 * * 0";

@Injectable()
export class BackupSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    private readonly temporal: TemporalService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensureSchedule();
    } catch (err) {
      this.logger.error(
        `Failed to install Temporal schedule '${SCHEDULE_ID}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async ensureSchedule(): Promise<void> {
    const raw = this.temporal.client.getRawClient();
    if (!raw) {
      this.logger.warn(
        `Temporal client unavailable; skipping schedule install for '${SCHEDULE_ID}'.`,
      );
      return;
    }

    const taskQueue = this.config.get<string>("TEMPORAL_TASK_QUEUE")!;

    const spec: ScheduleOptions["spec"] = { cronExpressions: [CRON] };
    const action: ScheduleOptions["action"] = {
      type: "startWorkflow",
      workflowType: "dbBackupWorkflow",
      taskQueue,
      workflowId: SCHEDULE_ID,
    };
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };
    const description = `Weekly pg_dump to object storage (${CRON})`;

    try {
      await raw.schedule.create({
        scheduleId: SCHEDULE_ID,
        spec,
        action,
        policies,
        state: { note: description },
      });
      this.logger.log(`Created Temporal schedule '${SCHEDULE_ID}' — ${description}`);
      return;
    } catch (err) {
      if (!(err instanceof ScheduleAlreadyRunning)) throw err;
    }

    const handle = raw.schedule.getHandle(SCHEDULE_ID);
    await handle.update((prev) => ({
      spec,
      action,
      policies,
      state: prev.state,
    }));
    this.logger.log(`Updated Temporal schedule '${SCHEDULE_ID}' — ${description}`);
  }
}
