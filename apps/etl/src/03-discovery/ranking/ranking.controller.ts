import { Body, Controller, Post } from "@nestjs/common";

import {
  SENIORITY_VALUES,
  WORK_FORMAT_VALUES,
  type Seniority,
  type WorkFormat,
} from "../../platform/shared/contract";
import {
  parseDays,
  parseEnum,
  parseEnumArray,
  parseId,
  parsePage,
  parsePageSize,
  parseStringArray,
} from "../../platform/shared/query-parsing";
import { RankingService } from "./ranking.service";

interface MatchBody {
  skills?: unknown;
  seniorities?: unknown;
  workFormat?: unknown;
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
        workFormat: parseEnum<WorkFormat>("workFormat", body?.workFormat, WORK_FORMAT_VALUES),
        sourceId: parseId("sourceId", body?.sourceId),
        postedWithinDays: parseDays("postedWithinDays", body?.postedWithinDays),
      },
      parsePage(body?.page),
      parsePageSize(body?.pageSize),
    );
  }
}
