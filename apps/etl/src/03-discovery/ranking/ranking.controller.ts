import { Body, Controller, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { parseStringArray } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import { RankingService } from "./ranking.service";

@Controller("ranking")
@ApiTags("ranking")
@ApiBadRequestResponse({
  description: "Invalid skills or filter parameters.",
  type: ApiErrorResponseDto,
})
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

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
}
