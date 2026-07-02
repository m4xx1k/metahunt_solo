import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import { FeedQueryDto } from "../../platform/shared/filter-params.dto";
import { DEFAULT_PAGE_SIZE } from "../../platform/shared/query-parsing";
import { FeedService, type FeedSearchParams } from "./feed.service";
import { FacetsService } from "./facets.service";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller("feed")
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly facets: FacetsService,
    private readonly dedup: DedupService,
  ) {}

  // ValidationPipe (transform) turns the raw query into a validated FeedQueryDto:
  // enum arrays are checked, bad values 400 at the boundary, and the list/bool
  // transforms flatten repeated params, single values, and CSV to one shape.
  @Get()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  search(@Query() dto: FeedQueryDto) {
    return this.feed.search(toSearchParams(dto));
  }

  @Get("skills")
  skills() {
    return this.facets.getSkillFacets();
  }

  @Get("roles")
  roles() {
    return this.facets.getRoleFacets();
  }

  @Get("domains")
  domains() {
    return this.facets.getDomainFacets();
  }

  // Members + "why merged" reasons for one dedup group — backs the feed's
  // "show duplicates" drawer. `:id` is a unique_vacancies.id.
  @Get("group/:id")
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
