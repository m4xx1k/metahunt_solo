import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import {
  parseBool,
  parseEnum,
  parsePage,
  parsePageSize,
} from "../../platform/shared/query-parsing";
import type {
  DedupConfidence,
  UniqueVacanciesResponse,
} from "./dedup.contract";
import { DedupService } from "./dedup.service";

const DEFAULT_PAGE_SIZE = 25;
const CONFIDENCE_VALUES = ["gold", "confirmed", "all"] as const;

@Controller("operator/unique-vacancies")
export class DedupController {
  constructor(private readonly dedup: DedupService) {}

  @Get()
  list(
    @Query("crossSource") rawCrossSource?: string,
    @Query("minSimilarity") rawMinSimilarity?: string,
    @Query("confidence") rawConfidence?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ): Promise<UniqueVacanciesResponse> {
    return this.dedup.listGroups({
      crossSource: parseBool("crossSource", rawCrossSource),
      minSimilarity: parseSimilarity(rawMinSimilarity),
      confidence: parseEnum("confidence", rawConfidence, CONFIDENCE_VALUES) as
        | DedupConfidence
        | "all"
        | undefined,
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize, { default: DEFAULT_PAGE_SIZE }),
    });
  }
}

function parseSimilarity(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    throw new BadRequestException(
      `minSimilarity must be a number in [0, 1], got "${raw}"`,
    );
  }
  return n;
}
