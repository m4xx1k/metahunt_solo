import { BadRequestException, Body, Controller, Post } from "@nestjs/common";

import {
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type Seniority,
  type WorkFormat,
} from "../../platform/shared/contract";
import { RankingService } from "./ranking.service";

interface MatchBody {
  skills?: unknown;
  seniority?: unknown;
  workFormat?: unknown;
  sourceId?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

@Controller("ranking")
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  // Debug/verify the skill→node mapping for a CV (no ranking).
  @Post("resolve")
  resolve(@Body() body: { skills?: unknown }) {
    return this.ranking.resolveSkills(parseSkills(body?.skills));
  }

  // Rank vacancies for a candidate's plain-text skills.
  @Post("match")
  match(@Body() body: MatchBody) {
    return this.ranking.match(
      parseSkills(body?.skills),
      {
        seniority: parseEnum<Seniority>("seniority", body?.seniority, SENIORITY_VALUES),
        workFormat: parseEnum<WorkFormat>("workFormat", body?.workFormat, WORK_FORMAT_VALUES),
        sourceId: parseId(body?.sourceId),
      },
      parsePage(body?.page),
      parsePageSize(body?.pageSize),
    );
  }
}

function parseSkills(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== "string")) {
    throw new BadRequestException("skills must be an array of strings");
  }
  return raw as string[];
}

function parseEnum<T extends string>(
  name: string,
  raw: unknown,
  allowed: readonly string[],
): T | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || !allowed.includes(raw)) {
    throw new BadRequestException(`${name} must be one of ${allowed.join(", ")}`);
  }
  return raw as T;
}

function parseId(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new BadRequestException("sourceId must be a non-empty string");
  }
  return raw.trim();
}

function parsePage(raw: unknown): number {
  if (raw === undefined || raw === null) return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException("page must be a positive integer");
  }
  return n;
}

function parsePageSize(raw: unknown): number {
  if (raw === undefined || raw === null) return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new BadRequestException("pageSize must be an integer 1..100");
  }
  return n;
}
