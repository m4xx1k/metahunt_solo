import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from "@nestjs/swagger";

import type { JwtUser } from "../../platform/auth/auth.types";
import { CurrentUser } from "../../platform/auth/decorators/current-user.decorator";
import { parseBool, parsePage, parsePageSize } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";
import { OperatorApi } from "../../platform/swagger/operator-api.decorator";

import type { UniqueVacanciesResponse } from "./dedup.contract";
import { DedupService } from "./dedup.service";
import { DetachVacancyDto } from "./detach-vacancy.dto";

const DEFAULT_PAGE_SIZE = 25;

@Controller("operator/unique-vacancies")
@OperatorApi("operator: deduplication")
@ApiBadRequestResponse({ description: "Invalid query parameter.", type: ApiErrorResponseDto })
export class DedupController {
  constructor(private readonly dedup: DedupService) {}

  @Get()
  @ApiOperation({ summary: "Review deduplication groups" })
  @ApiOkResponse({ description: "Paginated deduplication groups." })
  list(
    @Query("crossSource") rawCrossSource?: string,
    @Query("groupId", new ParseUUIDPipe({ optional: true })) groupId?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ): Promise<UniqueVacanciesResponse> {
    return this.dedup.listGroups({
      crossSource: parseBool("crossSource", rawCrossSource),
      groupId,
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize, { default: DEFAULT_PAGE_SIZE }),
    });
  }

  @Post(":groupId/detach")
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: "Mark a member as a different job and rebuild its group" })
  @ApiOkResponse({ description: "The group the vacancy lives in after the rebuild." })
  @ApiNotFoundResponse({
    description: "The vacancy is not a member of this group.",
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: "The group changed meanwhile; the detach is saved and applies on the next sweep.",
    type: ApiErrorResponseDto,
  })
  detach(
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() body: DetachVacancyDto,
    @CurrentUser() user: JwtUser,
  ): Promise<{ groupId: string }> {
    return this.dedup.detach(groupId, body.vacancyId, user.userId);
  }
}
