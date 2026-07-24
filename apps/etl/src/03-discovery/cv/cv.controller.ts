import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiExcludeController } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import type { JwtUser } from "../../platform/auth/auth.types";
import { CurrentUser } from "../../platform/auth/decorators/current-user.decorator";
import { Public } from "../../platform/auth/decorators/public.decorator";
import { JwtAuthGuard } from "../../platform/auth/jwt-auth.guard";
import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
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
  parseCsv,
  parseDays,
  parseEnum,
  parseEnumCsv,
  parseId,
  parsePage,
  parsePageSize,
} from "../../platform/shared/query-parsing";
import {
  FIT_TIER_VALUES,
  type FitTier,
  type MatchResponse,
  type RecommendResponse,
  type RoleSuggestionsResponse,
} from "../ranking/ranking.contract";
import { RankingService } from "../ranking/ranking.service";
import { RecommendationService } from "../ranking/recommendation.service";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CandidateLoaderService } from "./candidate-loader.service";
import type {
  CandidateNodeRef,
  CandidateView,
  CvIngestResult,
  SampleCandidate,
  SkillSuggestion,
} from "./cv.contract";
import { extractText } from "./text-extract";

interface MatchQueryStrings {
  seniorities?: string;
  workFormats?: string;
  englishLevels?: string;
  employmentTypes?: string;
  domainIds?: string;
  roleIds?: string;
  experienceYears?: string;
  hasTestAssignment?: string;
  hasReservation?: string;
  minFitTier?: string;
  sourceId?: string;
  postedWithinDays?: string;
  page?: string;
  pageSize?: string;
}

// CV upload is LLM-backed (a BAML extraction per new file) + accepts user
// uploads, so it gets two guards on top of the global rate limit:
//   - a strict per-IP throttle (5/min) so the public endpoint can't burn
//     tokens or be used to spam the extractor;
//   - a 5 MB file cap (a text CV is KBs; anything larger is abuse/mistake).
const CV_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const CV_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("cv")
// This legacy capability-based CV API remains outside the published contract
// until its privacy/ownership hardening is delivered in a separate branch.
@ApiExcludeController()
@UseGuards(JwtAuthGuard)
export class CvController {
  constructor(
    private readonly loader: CandidateLoaderService,
    private readonly ranking: RankingService,
    private readonly recommendation: RecommendationService,
    private readonly additionalSkills: AdditionalSkillsService,
    private readonly slugs: NodeSlugResolver,
  ) {}

  // Upload a CV as a file (field "file": PDF or .txt) OR as raw JSON {text}.
  @Post()
  @Throttle(CV_THROTTLE)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: CV_UPLOAD_MAX_BYTES } }))
  async upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { text?: unknown } | undefined,
  ): Promise<CvIngestResult> {
    let text: string;
    if (file) {
      text = await extractText(file);
    } else if (typeof body?.text === "string" && body.text.trim().length > 0) {
      text = body.text;
    } else {
      throw new BadRequestException("provide a file (field 'file') or a non-empty 'text'");
    }
    return this.loader.loadForUser(user.userId, text);
  }

  // Demo profiles for the reverse-ATS picker. Declared before `:id` so the
  // literal path wins over the param route.
  @Get("samples")
  @Public()
  samples(): Promise<SampleCandidate[]> {
    return this.loader.listSamples();
  }

  @Get("samples/:id/matches")
  @Public()
  async sampleMatches(
    @Param("id") id: string,
    @Query() query: MatchQueryStrings,
  ): Promise<MatchResponse> {
    await this.loader.assertSampleCandidate(id);
    return this.matchCandidate(id, query);
  }

  @Get("samples/:id/role-suggestions")
  @Public()
  async sampleRoleSuggestions(@Param("id") id: string): Promise<RoleSuggestionsResponse> {
    await this.loader.assertSampleCandidate(id);
    return this.roleSuggestionsFor(id);
  }

  @Get(":id")
  async get(@CurrentUser() user: JwtUser, @Param("id") id: string): Promise<CandidateView> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.loader.getById(id);
  }

  // Rank all vacancies for a stored candidate.
  @Get(":id/matches")
  async matches(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Query() query: MatchQueryStrings,
  ): Promise<MatchResponse> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.matchCandidate(id, query);
  }

  private async matchCandidate(id: string, query: MatchQueryStrings): Promise<MatchResponse> {
    const refs = await this.loader.getMatchInput(id);
    return this.ranking.rankByRefs(
      refs,
      {
        seniorities: parseEnumCsv<Seniority>("seniorities", query.seniorities, SENIORITY_VALUES),
        workFormats: parseEnumCsv<WorkFormat>("workFormats", query.workFormats, WORK_FORMAT_VALUES),
        englishLevels: parseEnumCsv<EnglishLevel>(
          "englishLevels",
          query.englishLevels,
          ENGLISH_LEVEL_VALUES,
        ),
        employmentTypes: parseEnumCsv<EmploymentType>(
          "employmentTypes",
          query.employmentTypes,
          EMPLOYMENT_TYPE_VALUES,
        ),
        domainIds: await this.slugs.toIds("DOMAIN", parseCsv("domainIds", query.domainIds)),
        roleNodeIds: await this.slugs.toIds("ROLE", parseCsv("roleIds", query.roleIds)),
        experienceYears: parseCsv("experienceYears", query.experienceYears),
        hasTestAssignment: parseBool("hasTestAssignment", query.hasTestAssignment),
        hasReservation: parseBool("hasReservation", query.hasReservation),
        minFitTier: parseEnum<FitTier>("minFitTier", query.minFitTier, FIT_TIER_VALUES),
        sourceId: parseId("sourceId", query.sourceId),
        postedWithinDays: parseDays("postedWithinDays", query.postedWithinDays),
      },
      parsePage(query.page),
      parsePageSize(query.pageSize),
    );
  }

  // "Which roles fit my skills": top-5 ROLE nodes by covered share of their
  // recent vacancies, the CV's declared role pinned first.
  @Get(":id/role-suggestions")
  async roleSuggestions(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
  ): Promise<RoleSuggestionsResponse> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.roleSuggestionsFor(id);
  }

  private async roleSuggestionsFor(id: string): Promise<RoleSuggestionsResponse> {
    const { matched, role } = await this.loader.getRecommendInput(id);
    const pinnedRoleId = await this.ranking.resolveRole(role);
    return this.ranking.suggestRoles(matched, pinnedRoleId);
  }

  // "What to learn next": skills that would unlock the most cohort vacancies.
  @Get(":id/recommendations")
  async recommendations(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
  ): Promise<RecommendResponse> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    const { matched, role, seniority } = await this.loader.getRecommendInput(id);
    const roleNodeId = await this.ranking.resolveRole(role);
    return this.recommendation.recommend(matched, roleNodeId, seniority);
  }

  // "You probably also know X": skills implied by the ones the CV listed.
  @Get(":id/skill-suggestions")
  async skillSuggestions(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
  ): Promise<SkillSuggestion[]> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.additionalSkills.suggest(id);
  }

  // Add a skill (confirmed suggestion or manual search-add); returns the set.
  @Post(":id/skills")
  @Throttle(CV_THROTTLE)
  async addSkill(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { nodeId?: unknown } | undefined,
  ): Promise<CandidateNodeRef[]> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.loader.confirmSkill(id, await this.resolveSkillNode(body?.nodeId));
  }

  // Dismiss a suggestion so it never resurfaces for this candidate.
  @Post(":id/skills/reject")
  @Throttle(CV_THROTTLE)
  async rejectSkill(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Body() body: { nodeId?: unknown } | undefined,
  ): Promise<{ ok: true }> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    await this.loader.rejectSuggestion(id, await this.resolveSkillNode(body?.nodeId));
    return { ok: true };
  }

  // Remove a skill from the candidate; returns the remaining skill set.
  @Delete(":id/skills/:nodeId")
  async removeSkill(
    @CurrentUser() user: JwtUser,
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
  ): Promise<CandidateNodeRef[]> {
    await this.loader.assertAccessibleCandidate(user.userId, id);
    return this.loader.removeSkill(id, await this.resolveSkillNode(nodeId));
  }

  // A skill ref arrives as a UUID (from suggestions/matched) or a slug (from the
  // public /feed/skills catalog powering the /me search) — resolve both to a
  // node id. NodeSlugResolver maps slugs and passes UUIDs through.
  private async resolveSkillNode(raw: unknown): Promise<string> {
    const ref = parseId("nodeId", raw, { required: true });
    const nodeId = await this.slugs.toId("SKILL", ref);
    if (!nodeId) throw new BadRequestException(`unknown skill: ${ref ?? ""}`);
    return nodeId;
  }
}
