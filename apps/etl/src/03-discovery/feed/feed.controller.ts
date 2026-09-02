import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
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

import { DRIZZLE } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { DedupService } from "../../02-enrich/dedup/dedup.service";
import type { RequestWithUser } from "../../platform/auth/auth.types";
import { OptionalAuthGuard } from "../../platform/auth/optional-auth.guard";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import { FeedQueryDto } from "../../platform/shared/filter-params.dto";
import { DEFAULT_PAGE_SIZE, isUuid, parseDays } from "../../platform/shared/query-parsing";
import { ApiErrorResponseDto } from "../../platform/swagger/api-error.dto";
import { overlayForUser } from "../score/scorer.port";

import { FacetsService } from "./facets.service";
import type { SitemapResponse, VacancyDto } from "./feed.contract";
import { FeedService, type FeedSearchParams } from "./feed.service";

// Matches the product's own 30-day freshness window; the cap keeps a hand-typed
// ?postedWithinDays=99999 from asking for the entire table.
const SITEMAP_DEFAULT_DAYS = 30;
const SITEMAP_MAX_DAYS = 365;

// The nil UUID: `companies.id` is defaultRandom(), so it can never collide.
// An unknown company slug must match nothing rather than dropping the filter.
const UNMATCHABLE_ID = "00000000-0000-0000-0000-000000000000";

@Controller("feed")
@ApiTags("feed")
@ApiBadRequestResponse({
  description: "Invalid filter or pagination parameter.",
  type: ApiErrorResponseDto,
})
export class FeedController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
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
    let companyId: string | undefined;
    [dto.roleIds, dto.skillIds, dto.excludedSkillIds, dto.domainIds, dto.roleId, companyId] =
      await Promise.all([
        this.slugs.toIds("ROLE", dto.roleIds),
        this.slugs.toIds("SKILL", dto.skillIds),
        this.slugs.toIds("SKILL", dto.excludedSkillIds),
        this.slugs.toIds("DOMAIN", dto.domainIds),
        this.slugs.toId("ROLE", dto.roleId),
        this.resolveCompany(dto.companySlug),
      ]);
    return this.feed.search({ ...toSearchParams(dto), companyId });
  }

  // Companies aren't taxonomy nodes, so they don't go through NodeSlugResolver.
  // An unknown slug must match nothing rather than silently dropping the filter.
  private async resolveCompany(slug: string | undefined): Promise<string | undefined> {
    if (!slug) return undefined;
    return (await this.facets.resolveCompanySlug(slug)) ?? UNMATCHABLE_ID;
  }

  // Every publicly visible vacancy URL in one response. The browse endpoint caps
  // pageSize at 100, so building a sitemap from it costs ~49 round trips; this
  // ships only the four fields a <url> entry needs.
  @Get("sitemap")
  @ApiOperation({ summary: "List every publicly visible vacancy, slim, for the sitemap" })
  @ApiOkResponse({ description: "Vacancy ids, titles and timestamps." })
  async sitemap(@Query("postedWithinDays") postedWithinDays?: string): Promise<SitemapResponse> {
    const days = parseDays("postedWithinDays", postedWithinDays) ?? SITEMAP_DEFAULT_DAYS;
    return { items: await this.feed.listForSitemap(Math.min(days, SITEMAP_MAX_DAYS)) };
  }

  @Get("companies")
  @ApiOperation({ summary: "List hiring companies with open vacancies" })
  @ApiOkResponse({ description: "Company slugs, names and vacancy counts." })
  companies() {
    return this.facets.getCompanyFacets();
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

  // Full detail for one vacancy (including description) — backs the public
  // vacancy detail page (`/vacancy/:id`). `:id` is a vacancies.id; works for
  // any member of a dedup group, not just the representative row.
  //
  // Optional auth: OptionalAuthGuard resolves `req.user` when a valid
  // session token rides along, but never rejects an anonymous request. With
  // a signed-in viewer, one `overlayFor([positionId])` scores this single
  // Position against their active CV — MET-144 §7 step 2, the smallest real
  // overlayFor consumer. Provisional: step 3's resolveFeedQuery becomes "the
  // only code that knows candidates exist" and this inlined resolve folds
  // into it then.
  @Get("vacancy/:id")
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: "Read full detail for one vacancy" })
  @ApiOkResponse({ description: "Full vacancy detail, including description." })
  @ApiNotFoundResponse({ description: "Vacancy was not found.", type: ApiErrorResponseDto })
  async vacancy(@Param("id") id: string, @Req() req: RequestWithUser): Promise<VacancyDto> {
    const vacancy = await this.feed.getById(id);
    if (!vacancy) throw new NotFoundException();
    return this.withMatch(vacancy, req.user?.userId);
  }

  private async withMatch(vacancy: VacancyDto, userId: string | undefined): Promise<VacancyDto> {
    if (!userId || !vacancy.uniqueVacancyId) return vacancy;
    const overlay = await overlayForUser(this.db, userId, [vacancy.uniqueVacancyId]);
    return { ...vacancy, match: overlay.get(vacancy.uniqueVacancyId) ?? null };
  }

  // Members + "why merged" reasons for one dedup group — backs the feed's
  // "show duplicates" drawer. `:id` is a unique_vacancies.id.
  @Get("group/:id")
  @ApiOperation({ summary: "Read members of one deduplication group" })
  @ApiOkResponse({ description: "Duplicate group members and merge reasons." })
  @ApiNotFoundResponse({ description: "Group was not found.", type: ApiErrorResponseDto })
  async group(@Param("id") id: string) {
    if (!isUuid(id)) throw new NotFoundException();
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
    excludedSkillIds: dto.excludedSkillIds,
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
