import { BadRequestException, Controller, Get, Query } from "@nestjs/common";

import type {
  DedupConfidence,
  UniqueVacanciesResponse,
} from "./dedup.contract";
import { DedupService } from "./dedup.service";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
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
      confidence: parseConfidence(rawConfidence),
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize),
    });
  }
}

function parseBool(name: string, raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new BadRequestException(`${name} must be "true" or "false"`);
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

function parseConfidence(
  raw: string | undefined,
): DedupConfidence | "all" | undefined {
  if (raw === undefined) return undefined;
  if (!(CONFIDENCE_VALUES as readonly string[]).includes(raw)) {
    throw new BadRequestException(
      `confidence must be one of ${CONFIDENCE_VALUES.join(", ")}`,
    );
  }
  return raw as DedupConfidence | "all";
}

function parsePage(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(
      `page must be a positive integer, got "${raw}"`,
    );
  }
  return n;
}

function parsePageSize(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw new BadRequestException(
      `pageSize must be an integer in [1, ${MAX_PAGE_SIZE}], got "${raw}"`,
    );
  }
  return n;
}
