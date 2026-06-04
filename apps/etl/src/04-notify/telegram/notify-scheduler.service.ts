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

const SCHEDULE_ID = "tg-digest-daytime";
const SCHEDULE_TIMEZONE = "Europe/Kyiv";
const SCHEDULE_HOUR_START = 9;
const SCHEDULE_HOUR_END = 21;
const SCHEDULE_STEP_HOURS = 3; // 09, 12, 15, 18, 21

// Installs the Temporal schedule that fires `notifySubscribersWorkflow` a few
// times a day. Mirrors RssSchedulerService; idempotent create-or-update on boot.
@Injectable()
export class NotifySchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotifySchedulerService.name);

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
    // No token → the bot is dormant and `sendMessage` would throw, so don't
    // install a schedule that can only produce failing runs.
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (token.length === 0) {
      this.logger.warn(
        `TELEGRAM_BOT_TOKEN not set; skipping schedule install for '${SCHEDULE_ID}'.`,
      );
      return;
    }

    const raw = this.temporal.client.getRawClient();
    if (!raw) {
      this.logger.warn(
        `Temporal client unavailable; skipping schedule install for '${SCHEDULE_ID}'.`,
      );
      return;
    }

    const taskQueue = this.config.get<string>("TEMPORAL_TASK_QUEUE")!;

    const spec: ScheduleOptions["spec"] = {
      calendars: [
        {
          minute: 0,
          hour: {
            start: SCHEDULE_HOUR_START,
            end: SCHEDULE_HOUR_END,
            step: SCHEDULE_STEP_HOURS,
          },
        },
      ],
      timezone: SCHEDULE_TIMEZONE,
    };
    const action: ScheduleOptions["action"] = {
      type: "startWorkflow",
      workflowType: "notifySubscribersWorkflow",
      taskQueue,
      workflowId: "tg-digest",
    };
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };
    const description = `TG digests every ${SCHEDULE_STEP_HOURS}h, ${String(
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
