import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, isNotNull, notExists, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { VacancyLoaderService } from "./vacancy-loader.service";

@Injectable()
export class LoaderBackfillService {
  private readonly logger = new Logger(LoaderBackfillService.name);

  constructor(
    private readonly loader: VacancyLoaderService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /**
   * One-shot backfill: runs `loadFromRecord` for rss_records whose extraction
   * succeeded but never produced a vacancies row (typically because a prior
   * pipeline workflow failed before the loader could persist). Bypasses
   * Temporal — runs in-process — so it skips workflow scheduling and the
   * deterministic-id reuse policy. Per-record errors are caught and counted
   * so one bad record doesn't stop the rest.
   */
  async loadMissing(
    limit: number,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const rows = await this.db
      .select({ id: schema.rssRecords.id })
      .from(schema.rssRecords)
      .where(
        and(
          isNotNull(schema.rssRecords.extractedAt),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(schema.vacancies)
              .where(
                and(
                  eq(schema.vacancies.sourceId, schema.rssRecords.sourceId),
                  eq(
                    schema.vacancies.externalId,
                    schema.rssRecords.externalId,
                  ),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(schema.rssRecords.createdAt))
      .limit(limit)
      .execute();

    this.logger.log(`loadMissing: ${rows.length} record(s) pending`);
    let succeeded = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        await this.loader.loadFromRecord(id);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `loadMissing: record ${id} failed — ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    this.logger.log(
      `loadMissing done — attempted=${rows.length} succeeded=${succeeded} failed=${failed}`,
    );
    return { attempted: rows.length, succeeded, failed };
  }
}
