import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TemporalService } from "nestjs-temporal-core";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  type ScheduleOptions,
} from "@temporalio/client";

const SCHEDULE_ID = "rss-ingest-hourly";
const SCHEDULE_TIMEZONE = "Europe/Kyiv";
const SCHEDULE_HOUR_START = 6;
const SCHEDULE_HOUR_END = 22;

@Injectable()
export class RssSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RssSchedulerService.name);

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

    const intervalHours = this.config.get<number>("RSS_INGEST_INTERVAL_HOURS")!;
    const taskQueue = this.config.get<string>("TEMPORAL_TASK_QUEUE")!;

    const spec: ScheduleOptions["spec"] = {
      calendars: [
        {
          minute: 0,
          hour: {
            start: SCHEDULE_HOUR_START,
            end: SCHEDULE_HOUR_END,
            step: intervalHours,
          },
        },
      ],
      timezone: SCHEDULE_TIMEZONE,
    };
    const action: ScheduleOptions["action"] = {
      type: "startWorkflow",
      workflowType: "rssIngestAllWorkflow",
      taskQueue,
      workflowId: "rss-ingest-all",
    };
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };
    const description = `RSS ingest every ${intervalHours}h, ${String(
      SCHEDULE_HOUR_START,
    ).padStart(2, "0")}:00–${String(SCHEDULE_HOUR_END).padStart(
      2,
      "0",
    )}:00 ${SCHEDULE_TIMEZONE}`;

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
