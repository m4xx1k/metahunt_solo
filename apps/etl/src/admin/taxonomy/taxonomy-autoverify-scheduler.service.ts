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

const SCHEDULE_ID = "taxonomy-autoverify";
const RUN_INTERVAL_HOURS = 24;

// Promotes well-used NEW skills to VERIFIED on a daily cadence so the
// moderation backlog never re-grows — verification is threshold-driven,
// operators only demote junk (HIDDEN, which the pass never touches).
// SKIP overlap + idempotent UPDATE → a skipped or doubled fire loses nothing.
@Injectable()
export class TaxonomyAutoverifySchedulerService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(TaxonomyAutoverifySchedulerService.name);

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
      intervals: [{ every: `${RUN_INTERVAL_HOURS} hours` }],
    };
    const action: ScheduleOptions["action"] = {
      type: "startWorkflow",
      workflowType: "taxonomyAutoverifyWorkflow",
      taskQueue,
      workflowId: "taxonomy-autoverify",
    };
    const policies = { overlap: ScheduleOverlapPolicy.SKIP };
    const description = `Skill auto-verify pass every ${RUN_INTERVAL_HOURS}h`;

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
