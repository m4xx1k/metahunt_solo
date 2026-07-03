import {
  Body,
  Controller,
  Post,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";

import { MatchDto } from "../../platform/shared/filter-params.dto";
import {
  DEFAULT_PAGE_SIZE,
  parseStringArray,
} from "../../platform/shared/query-parsing";
import { RankingService } from "./ranking.service";

@Controller("ranking")
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  // Debug/verify the skill→node mapping for a CV (no ranking).
  @Post("resolve")
  resolve(@Body() body: { skills?: unknown }) {
    return this.ranking.resolveSkills(parseStringArray("skills", body?.skills));
  }

  // Rank vacancies for a candidate's plain-text skills. The DTO validates the
  // shared filters (same contract as GET /feed) + the warm-only fit gate.
  @Post("match")
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  match(@Body() dto: MatchDto) {
    return this.ranking.match(
      dto.skills ?? [],
      {
        seniorities: dto.seniorities,
        workFormats: dto.workFormats,
        englishLevels: dto.englishLevels,
        employmentTypes: dto.employmentTypes,
        hasTestAssignment: dto.hasTestAssignment,
        hasReservation: dto.hasReservation,
        minFitTier: dto.minFitTier,
        sourceId: dto.sourceId,
        postedWithinDays: dto.postedWithinDays,
      },
      dto.page ?? 1,
      dto.pageSize ?? DEFAULT_PAGE_SIZE,
    );
  }
}
