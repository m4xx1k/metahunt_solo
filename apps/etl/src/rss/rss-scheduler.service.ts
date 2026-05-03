import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { asc, isNotNull, isNull } from "drizzle-orm";
import { TemporalService } from "nestjs-temporal-core";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  type ScheduleOptions,
} from "@temporalio/client";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, Source } from "@metahunt/database";

import { RssExtractActivity } from "./activities/rss-extract.activity";

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
    private readonly extractActivity: RssExtractActivity,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
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

  /**
   * One-shot backfill: re-runs `extractAndInsert` for records that parse
   * inserted but extraction never ran for (or failed before the activity
   * could write `extracted_at`). Bypasses Temporal — runs in-process — so
   * it skips the activity-level retry policy. Per-record errors are caught
   * and counted so one bad record doesn't stop the rest.
   */
  async extractMissing(
    limit: number,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const rows = await this.db
      .select({ id: schema.rssRecords.id })
      .from(schema.rssRecords)
      .where(isNull(schema.rssRecords.extractedAt))
      .orderBy(asc(schema.rssRecords.createdAt))
      .limit(limit)
      .execute();

    this.logger.log(`extractMissing: ${rows.length} record(s) pending`);
    let succeeded = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        await this.extractActivity.extractAndInsert(id);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `extractMissing: record ${id} failed — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    this.logger.log(
      `extractMissing done — attempted=${rows.length} succeeded=${succeeded} failed=${failed}`,
    );
    return { attempted: rows.length, succeeded, failed };
  }

  async ingestRemote(): Promise<void> {
    const sources = await this.db
      .select()
      .from(schema.sources)
      .where(isNotNull(schema.sources.rssUrl))
      .execute();
    await this.startWorkflows(sources);
  }

  async ingestAll(): Promise<void> {
    const sources = await this.db.select().from(schema.sources).execute();
    await this.startWorkflows(sources);
  }

  private async startWorkflows(sources: Source[]): Promise<void> {
    this.logger.log(
      sources.map((s) => `${s.code} - ${s.rssUrl}`).join(" <{+|+}> "),
    );
    for (const source of sources) {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace(/Z$/, "");
      await this.temporal.startWorkflow("rssIngestWorkflow", [source.id], {
        workflowId: `rss-ingest-${source.code}-${stamp}`,
        taskQueue: "rss-ingest",
      });
    }
  }
}
