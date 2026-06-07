import { Body, Controller, Post } from "@nestjs/common";

import {
  EMPLOYMENT_TYPE_VALUES,
  ENGLISH_LEVEL_VALUES,
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type EmploymentType,
  type EnglishLevel,
  type Seniority,
  type WorkFormat,
} from "../../platform/shared/contract";
import {
  parseBool,
  parseDays,
  parseEnum,
  parseEnumArray,
  parseId,
  parsePage,
  parsePageSize,
  parseStringArray,
} from "../../platform/shared/query-parsing";
import { FIT_TIER_VALUES, type FitTier } from "./ranking.contract";
import { RankingService } from "./ranking.service";

interface MatchBody {
  skills?: unknown;
  seniorities?: unknown;
  workFormats?: unknown;
  englishLevels?: unknown;
  employmentTypes?: unknown;
  hasTestAssignment?: unknown;
  hasReservation?: unknown;
  minFitTier?: unknown;
  sourceId?: unknown;
  postedWithinDays?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

@Controller("ranking")
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  // Debug/verify the skill→node mapping for a CV (no ranking).
  @Post("resolve")
  resolve(@Body() body: { skills?: unknown }) {
    return this.ranking.resolveSkills(parseStringArray("skills", body?.skills));
  }

  // Rank vacancies for a candidate's plain-text skills.
  @Post("match")
  match(@Body() body: MatchBody) {
    return this.ranking.match(
      parseStringArray("skills", body?.skills),
      {
        seniorities: parseEnumArray<Seniority>("seniorities", body?.seniorities, SENIORITY_VALUES),
        workFormats: parseEnumArray<WorkFormat>("workFormats", body?.workFormats, WORK_FORMAT_VALUES),
        englishLevels: parseEnumArray<EnglishLevel>("englishLevels", body?.englishLevels, ENGLISH_LEVEL_VALUES),
        employmentTypes: parseEnumArray<EmploymentType>("employmentTypes", body?.employmentTypes, EMPLOYMENT_TYPE_VALUES),
        hasTestAssignment: parseBool("hasTestAssignment", body?.hasTestAssignment),
        hasReservation: parseBool("hasReservation", body?.hasReservation),
        minFitTier: parseEnum<FitTier>("minFitTier", body?.minFitTier, FIT_TIER_VALUES),
        sourceId: parseId("sourceId", body?.sourceId),
        postedWithinDays: parseDays("postedWithinDays", body?.postedWithinDays),
      },
      parsePage(body?.page),
      parsePageSize(body?.pageSize),
    );
  }
}
