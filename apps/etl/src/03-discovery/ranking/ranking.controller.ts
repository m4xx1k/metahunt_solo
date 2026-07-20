import { Body, Controller, Post, UsePipes, ValidationPipe } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { MatchDto } from "../../platform/shared/filter-params.dto";
import { DEFAULT_PAGE_SIZE, parseStringArray } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import { RankingService } from "./ranking.service";

@Controller("ranking")
@ApiTags("ranking")
@ApiBadRequestResponse({
  description: "Invalid skills or filter parameters.",
  type: ApiErrorResponseDto,
})
export class RankingController {
  constructor(
    private readonly ranking: RankingService,
    private readonly slugs: NodeSlugResolver,
  ) {}

  // Debug/verify the skill→node mapping for a CV (no ranking).
  @Post("resolve")
  @ApiOperation({ summary: "Resolve plain-text skills to taxonomy nodes" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["skills"],
      properties: { skills: { type: "array", items: { type: "string" } } },
    },
  })
  @ApiOkResponse({ description: "Resolved and unresolved skill strings." })
  resolve(@Body() body: { skills?: unknown }) {
    return this.ranking.resolveSkills(parseStringArray("skills", body?.skills));
  }

  // Rank vacancies for a candidate's plain-text skills. The DTO validates the
  // shared filters (same contract as GET /feed) + the warm-only fit gate.
  @Post("match")
  @ApiOperation({ summary: "Rank vacancies for candidate skills" })
  @ApiBody({ type: MatchDto })
  @ApiOkResponse({ description: "Ranked vacancies and match metadata." })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async match(@Body() dto: MatchDto) {
    return this.ranking.match(
      dto.skills ?? [],
      {
        seniorities: dto.seniorities,
        workFormats: dto.workFormats,
        englishLevels: dto.englishLevels,
        employmentTypes: dto.employmentTypes,
        domainIds: await this.slugs.toIds("DOMAIN", dto.domainIds),
        experienceYears: dto.experienceYears,
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
