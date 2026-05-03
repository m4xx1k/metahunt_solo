import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from "@nestjs/common";
import { RssSchedulerService } from "./rss-scheduler.service";

const EXTRACT_MISSING_DEFAULT = 100;
const EXTRACT_MISSING_MAX = 500;

@Controller("rss")
export class RssController {
  constructor(private readonly scheduler: RssSchedulerService) {}

  @Get()
  @HttpCode(202)
  triggerAll(): { triggered: "all" } {
    void this.scheduler.ingestAll();
    return { triggered: "all" };
  }

  /**
   * One-shot backfill for records stuck with `extracted_at IS NULL`
   * (typically because a prior workflow failed *after* parse but *before*
   * extraction wrote them). Synchronous on purpose so the response carries
   * counts; bound the work via `?limit=` to avoid HTTP timeouts.
   */
  @Post("extract-missing")
  async extractMissing(
    @Query("limit") rawLimit?: string,
  ): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const limit = parseLimit(rawLimit);
    return this.scheduler.extractMissing(limit);
  }
}

function parseLimit(raw: string | undefined): number {
  if (raw === undefined) return EXTRACT_MISSING_DEFAULT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > EXTRACT_MISSING_MAX) {
    throw new BadRequestException(
      `limit must be an integer in 1..${EXTRACT_MISSING_MAX}, got "${raw}"`,
    );
  }
  return n;
}
