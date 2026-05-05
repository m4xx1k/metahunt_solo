import {
  BadRequestException,
  Controller,
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
   * One-shot backfill for rss_records that were extracted but never loaded
   * into vacancies (typically because a prior vacancyPipelineWorkflow failed
   * and the workflow-id reuse policy blocked a fresh attempt). Synchronous
   * so the response carries counts; bound the work via `?limit=` to avoid
   * HTTP timeouts.
   */
  @Post("backfill")
  async backfill(
    @Query("limit") rawLimit?: string,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const limit = parseLimit(rawLimit);
    return this.backfillService.loadMissing(limit);
  }
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return BACKFILL_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > BACKFILL_MAX) {
    throw new BadRequestException(
      `limit must be an integer in 1..${BACKFILL_MAX}, got "${raw}"`,
    );
  }
  return n;
}
