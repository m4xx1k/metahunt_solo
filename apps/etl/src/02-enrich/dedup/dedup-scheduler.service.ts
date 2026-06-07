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

const SCHEDULE_ID = "dedup-sweep";
const SWEEP_INTERVAL_MINUTES = 5;

// Runs the embed→resolve sweep on a fixed interval so new vacancies get
// deduped without a manual CLI run. SKIP overlap keeps a slow first run (full
// corpus) from stacking; the sweep is idempotent so a skipped tick loses
// nothing — the next one picks up the same unresolved rows.
@Injectable()
export class DedupSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DedupSchedulerService.name);

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

    const spec: ScheduleOptions["spec"] = {
      intervals: [{ every: `${SWEEP_INTERVAL_MINUTES} minutes` }],
    };
    const action: ScheduleOptions["action"] = {
      type: "startWorkflow",
      workflowType: "dedupSweepWorkflow",
      taskQueue,
      workflowId: "dedup-sweep",
    };
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };
    const description = `Dedup embed+resolve sweep every ${SWEEP_INTERVAL_MINUTES}m`;

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
