import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { FeedQueryDto } from "../../platform/shared/filter-params.dto";
import { DEFAULT_PAGE_SIZE } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";

import { FacetsService } from "./facets.service";
import { FeedService, type FeedSearchParams } from "./feed.service";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("feed")
@ApiTags("feed")
@ApiBadRequestResponse({
  description: "Invalid filter or pagination parameter.",
  type: ApiErrorResponseDto,
})
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly facets: FacetsService,
    private readonly dedup: DedupService,
    private readonly slugs: NodeSlugResolver,
  ) {}

  // ValidationPipe (transform) turns the raw query into a validated FeedQueryDto:
  // enum arrays are checked, bad values 400 at the boundary, and the list/bool
  // transforms flatten repeated params, single values, and CSV to one shape.
  // The role/skill/domain axes arrive as slugs (?roles=backend-engineer); we
  // resolve them to node ids here so everything downstream stays id-based.
  @Get()
  @ApiOperation({ summary: "Browse vacancies with filters and pagination" })
  @ApiOkResponse({ description: "A page of structured vacancies and facets." })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async search(@Query() dto: FeedQueryDto) {
    [dto.roleIds, dto.skillIds, dto.domainIds, dto.roleId] = await Promise.all([
      this.slugs.toIds("ROLE", dto.roleIds),
      this.slugs.toIds("SKILL", dto.skillIds),
      this.slugs.toIds("DOMAIN", dto.domainIds),
      this.slugs.toId("ROLE", dto.roleId),
    ]);
    return this.feed.search(toSearchParams(dto));
  }

  @Get("skills")
  @ApiOperation({ summary: "List skill facets" })
  @ApiOkResponse({ description: "Verified skill facets and counts." })
  skills() {
    return this.facets.getSkillFacets();
  }

  @Get("roles")
  @ApiOperation({ summary: "List role facets" })
  @ApiOkResponse({ description: "Verified role facets and counts." })
  roles() {
    return this.facets.getRoleFacets();
  }

  @Get("domains")
  @ApiOperation({ summary: "List domain facets" })
  @ApiOkResponse({ description: "Verified domain facets and counts." })
  domains() {
    return this.facets.getDomainFacets();
  }

  // Members + "why merged" reasons for one dedup group — backs the feed's
  // "show duplicates" drawer. `:id` is a unique_vacancies.id.
  @Get("group/:id")
  @ApiOperation({ summary: "Read members of one deduplication group" })
  @ApiOkResponse({ description: "Duplicate group members and merge reasons." })
  @ApiNotFoundResponse({ description: "Group was not found.", type: ApiErrorResponseDto })
  async group(@Param("id") id: string) {
    if (!UUID_REGEX.test(id)) throw new NotFoundException();
    const group = await this.dedup.getGroupForFeed(id);
    if (!group) throw new NotFoundException();
    return group;
  }
}

function toSearchParams(dto: FeedQueryDto): FeedSearchParams {
  return {
    q: dto.q,
    sourceId: dto.sourceId,
    roleId: dto.roleId,
    roleIds: dto.roleIds,
    skillIds: dto.skillIds,
    domainIds: dto.domainIds,
    seniorities: dto.seniorities,
    workFormats: dto.workFormats,
    englishLevels: dto.englishLevels,
    employmentTypes: dto.employmentTypes,
    experienceYears: dto.experienceYears,
    hasTestAssignment: dto.hasTestAssignment,
    hasReservation: dto.hasReservation,
    hasDuplicates: dto.hasDuplicates,
    includeRoleless: dto.includeRoleless,
    includeAllSkills: dto.includeAllSkills,
    includeOptionalSkills: dto.includeOptionalSkills,
    postedWithinDays: dto.postedWithinDays,
    page: dto.page ?? 1,
    pageSize: dto.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}
