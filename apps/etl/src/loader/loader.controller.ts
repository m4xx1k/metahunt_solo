import {
  BadRequestException,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";

import { LoaderBackfillService } from "./services/loader-backfill.service";

const BACKFILL_DEFAULT = 100;
const BACKFILL_MAX = 500;

@Controller("loader")
export class LoaderController {
  constructor(private readonly backfillService: LoaderBackfillService) {}

  /**
   * One-shot bounded backfill for rss_records that were extracted but
   * never loaded into vacancies (typically because a prior
   * vacancyPipelineWorkflow failed and the workflow-id reuse policy
   * blocked a fresh attempt). Synchronous so the response carries counts;
   * bound the work via `?limit=` to avoid HTTP timeouts. Use
   * `/loader/backfill/all` for unbounded bulk runs.
   */
  @Post("backfill")
  async backfill(
    @Query("limit") rawLimit?: string,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const limit = parseBoundedInt(rawLimit, "limit");
    return this.backfillService.loadMissing(limit);
  }

  /**
   * Unbounded fire-and-forget backfill: snapshots every pending
   * rss_record at the moment of the call and processes them in the
   * background, logging progress every `?batchSize=` records (default
   * 100, max 500). Returns 202 immediately with the snapshot count.
   *
   * Concurrent calls are rejected with 409 — only one bulk run at a
   * time per process. Records added during the run continue through the
   * normal Temporal pipeline; this only chases the existing backlog.
   * Idempotent: re-running is a no-op for ids already loaded.
   */
  @Post("backfill/all")
  @HttpCode(HttpStatus.ACCEPTED)
  async backfillAll(
    @Query("batchSize") rawBatchSize?: string,
  ): Promise<{ accepted: true; pending: number; batchSize: number }> {
    if (this.backfillService.isRunning()) {
      throw new ConflictException(
        "backfill already running on this instance",
      );
    }
    const batchSize = parseBoundedInt(rawBatchSize, "batchSize");
    const pending = await this.backfillService.countPending();
    void this.backfillService.loadAllInBackground(batchSize);
    return { accepted: true, pending, batchSize };
  }
}

function parseBoundedInt(raw: string | undefined, field: string): number {
  if (raw === undefined) return BACKFILL_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > BACKFILL_MAX) {
    throw new BadRequestException(
      `${field} must be an integer in 1..${BACKFILL_MAX}, got "${raw}"`,
    );
  }
  return n;
}
