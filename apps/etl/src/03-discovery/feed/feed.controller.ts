import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import {
  parseBool,
  parseEnum,
  parseIdList,
  parsePage,
  parsePageSize,
} from "../../platform/shared/query-parsing";
import { SENIORITY_VALUES, WORK_FORMAT_VALUES } from "./feed.contract";
import { FeedService } from "./feed.service";
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

  @Get()
  search(
    @Query("q") q?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
    @Query("sourceId") rawSourceId?: string,
    @Query("roleId") rawRoleId?: string,
    @Query("skillIds") rawSkillIds?: string | string[],
    @Query("seniority") rawSeniority?: string,
    @Query("workFormat") rawWorkFormat?: string,
    @Query("hasTestAssignment") rawHasTestAssignment?: string,
    @Query("hasReservation") rawHasReservation?: string,
    @Query("includeRoleless") rawIncludeRoleless?: string,
    @Query("includeAllSkills") rawIncludeAllSkills?: string,
    // Appended (not grouped with roleId) to keep the positional argument
    // order stable for existing callers/tests.
    @Query("roleIds") rawRoleIds?: string | string[],
    @Query("hasDuplicates") rawHasDuplicates?: string,
    @Query("includeOptionalSkills") rawIncludeOptionalSkills?: string,
    @Query("domainIds") rawDomainIds?: string | string[],
    @Query("experienceYears") rawExperienceYears?: string | string[],
  ) {
    const trimmed = q?.trim();
    const sourceId = rawSourceId?.trim();
    const roleId = rawRoleId?.trim();
    const roleIds = parseIdList(rawRoleIds);
    const skillIds = parseIdList(rawSkillIds);
    const domainIds = parseIdList(rawDomainIds);
    const experienceYears = parseIdList(rawExperienceYears);
    return this.feed.search({
      q: trimmed && trimmed.length > 0 ? trimmed : undefined,
      sourceId: sourceId && sourceId.length > 0 ? sourceId : undefined,
      roleId: roleId && roleId.length > 0 ? roleId : undefined,
      roleIds: roleIds.length > 0 ? roleIds : undefined,
      skillIds: skillIds.length > 0 ? skillIds : undefined,
      domainIds: domainIds.length > 0 ? domainIds : undefined,
      seniority: parseEnum("seniority", rawSeniority, SENIORITY_VALUES),
      workFormat: parseEnum("workFormat", rawWorkFormat, WORK_FORMAT_VALUES),
      hasTestAssignment: parseBool("hasTestAssignment", rawHasTestAssignment, { numeric: true }),
      hasReservation: parseBool("hasReservation", rawHasReservation, { numeric: true }),
      hasDuplicates: parseBool("hasDuplicates", rawHasDuplicates, { numeric: true }),
      page: parsePage(rawPage),
      pageSize: parsePageSize(rawPageSize),
      includeRoleless: parseBool("includeRoleless", rawIncludeRoleless, { numeric: true }),
      includeAllSkills: parseBool("includeAllSkills", rawIncludeAllSkills, { numeric: true }),
      includeOptionalSkills: parseBool("includeOptionalSkills", rawIncludeOptionalSkills, { numeric: true }),
      experienceYears: experienceYears.length > 0 ? experienceYears : undefined,
    });
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
