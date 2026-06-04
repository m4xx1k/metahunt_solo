import { Inject, Injectable, Logger } from "@nestjs/common";
import { asc, isNull } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { RssExtractActivity } from "./activities/rss-extract.activity";

@Injectable()
export class RssBackfillService {
  private readonly logger = new Logger(RssBackfillService.name);

  constructor(
    private readonly extractActivity: RssExtractActivity,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

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
}
