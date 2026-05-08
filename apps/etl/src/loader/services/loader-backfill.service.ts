import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, eq, isNotNull, notExists, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { VacancyLoaderService } from "./vacancy-loader.service";

@Injectable()
export class LoaderBackfillService {
  private readonly logger = new Logger(LoaderBackfillService.name);
  private running = false;

  constructor(
    private readonly loader: VacancyLoaderService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /**
   * One-shot bounded backfill: runs `loadFromRecord` for the next `limit`
   * rss_records whose extraction succeeded but never produced a vacancies
   * row (typically because a prior pipeline workflow failed before the
   * loader could persist). Bypasses Temporal — runs in-process — so it
   * skips workflow scheduling and the deterministic-id reuse policy.
   * Per-record errors are caught and counted so one bad record doesn't
   * stop the rest. Synchronous response; cap at /loader/backfill is 500
   * to keep the HTTP call within reasonable timeouts.
   */
  async loadMissing(
    limit: number,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const rows = await this.db
      .select({ id: schema.rssRecords.id })
      .from(schema.rssRecords)
      .where(this.pendingPredicate())
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

  /** True while `loadAllInBackground` is processing. Used by the controller
   * to reject concurrent calls. */
  isRunning(): boolean {
    return this.running;
  }

  /** Count of rss_records that satisfy the pending predicate. Cheap — a
   * single COUNT(*). Reported by /loader/backfill/all as the snapshot at
   * job start so the caller knows how big the run is. */
  async countPending(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<string>`count(*)::text` })
      .from(schema.rssRecords)
      .where(this.pendingPredicate())
      .execute();
    return Number(rows[0]?.count ?? "0");
  }

  /**
   * Fire-and-forget bulk backfill: snapshots all pending record ids upfront
   * (so failed records aren't re-fetched in subsequent batches), then runs
   * `loadFromRecord` over each. Logs progress every `batchSize` records.
   *
   * Sets `running` for the lifetime of the call; the controller rejects
   * concurrent calls with 409. Never throws — top-level errors are logged
   * and the flag is cleared in `finally`. Per-record errors are warned
   * and counted, the loop continues.
   *
   * Records added DURING the run are not picked up — those go through the
   * regular Temporal pipeline. Idempotent: rerunning is a no-op for ids
   * already loaded (vacancies upsert by `(source_id, external_id)`).
   */
  async loadAllInBackground(batchSize: number): Promise<void> {
    if (this.running) {
      this.logger.warn("loadAllInBackground: already running, skipping");
      return;
    }
    this.running = true;
    const startedAt = Date.now();
    try {
      const ids = await this.db
        .select({ id: schema.rssRecords.id })
        .from(schema.rssRecords)
        .where(this.pendingPredicate())
        .orderBy(asc(schema.rssRecords.createdAt))
        .execute();

      this.logger.log(
        `loadAllInBackground: starting — ${ids.length} record(s) pending (batchSize=${batchSize})`,
      );
      if (ids.length === 0) return;

      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < ids.length; i++) {
        const { id } = ids[i];
        try {
          await this.loader.loadFromRecord(id);
          succeeded += 1;
        } catch (err) {
          failed += 1;
          this.logger.warn(
            `loadAllInBackground: record ${id} failed — ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        const processed = i + 1;
        if (processed % batchSize === 0 || processed === ids.length) {
          const elapsed = (Date.now() - startedAt) / 1000;
          const rate = elapsed > 0 ? processed / elapsed : 0;
          this.logger.log(
            `loadAllInBackground progress — ${processed}/${ids.length} succeeded=${succeeded} failed=${failed} elapsed=${elapsed.toFixed(1)}s (${rate.toFixed(1)}/s)`,
          );
        }
      }

      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      this.logger.log(
        `loadAllInBackground done — total=${ids.length} succeeded=${succeeded} failed=${failed} elapsed=${elapsed}s`,
      );
    } catch (err) {
      this.logger.error(
        `loadAllInBackground crashed — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  private pendingPredicate() {
    return and(
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
    );
  }
}
