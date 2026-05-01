import { Injectable, Inject, Logger } from "@nestjs/common";
// import { Cron } from "@nestjs/schedule";
import { isNotNull } from "drizzle-orm";
import { TemporalService } from "nestjs-temporal-core";
import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, Source } from "@metahunt/database";

@Injectable()
export class RssSchedulerService {
  private readonly logger = new Logger(RssSchedulerService.name);

  constructor(
    private readonly temporal: TemporalService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  // @Cron("0 * * * *")  // re-enable when we want hourly cron; currently HTTP-trigger only
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
