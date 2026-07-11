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
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";

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

// CV upload is LLM-backed (a BAML extraction per new file) + accepts user
// uploads, so it gets two guards on top of the global rate limit:
//   - a strict per-IP throttle (5/min) so the public endpoint can't burn
//     tokens or be used to spam the extractor;
//   - a 5 MB file cap (a text CV is KBs; anything larger is abuse/mistake).
const CV_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const CV_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller("cv")
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
    return this.loader.loadFromText(text);
  }

  // Demo profiles for the reverse-ATS picker. Declared before `:id` so the
  // literal path wins over the param route.
  @Get("samples")
  samples(): Promise<SampleCandidate[]> {
    return this.loader.listSamples();
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<CandidateView> {
    return this.loader.getById(id);
  }

  // Rank all vacancies for a stored candidate.
  @Get(":id/matches")
  async matches(
    @Param("id") id: string,
    @Query("seniorities") rawSeniorities?: string,
    @Query("workFormats") rawWorkFormats?: string,
    @Query("englishLevels") rawEnglishLevels?: string,
    @Query("employmentTypes") rawEmploymentTypes?: string,
    @Query("domainIds") rawDomainIds?: string,
    @Query("experienceYears") rawExperienceYears?: string,
    @Query("hasTestAssignment") rawHasTestAssignment?: string,
    @Query("hasReservation") rawHasReservation?: string,
    @Query("minFitTier") rawMinFitTier?: string,
    @Query("sourceId") rawSourceId?: string,
    @Query("postedWithinDays") rawPostedWithinDays?: string,
    @Query("page") rawPage?: string,
    @Query("pageSize") rawPageSize?: string,
  ): Promise<MatchResponse> {
    const refs = await this.loader.getMatchInput(id);
    return this.ranking.rankByRefs(
      refs,
      {
        seniorities: parseEnumCsv<Seniority>("seniorities", rawSeniorities, SENIORITY_VALUES),
        workFormats: parseEnumCsv<WorkFormat>("workFormats", rawWorkFormats, WORK_FORMAT_VALUES),
        englishLevels: parseEnumCsv<EnglishLevel>(
          "englishLevels",
          rawEnglishLevels,
          ENGLISH_LEVEL_VALUES,
        ),
        employmentTypes: parseEnumCsv<EmploymentType>(
          "employmentTypes",
          rawEmploymentTypes,
          EMPLOYMENT_TYPE_VALUES,
        ),
        domainIds: await this.slugs.toIds("DOMAIN", parseCsv("domainIds", rawDomainIds)),
        experienceYears: parseCsv("experienceYears", rawExperienceYears),
        hasTestAssignment: parseBool("hasTestAssignment", rawHasTestAssignment),
        hasReservation: parseBool("hasReservation", rawHasReservation),
        minFitTier: parseEnum<FitTier>("minFitTier", rawMinFitTier, FIT_TIER_VALUES),
        sourceId: parseId("sourceId", rawSourceId),
        postedWithinDays: parseDays("postedWithinDays", rawPostedWithinDays),
      },
      parsePage(rawPage),
      parsePageSize(rawPageSize),
    );
  }

  // "What to learn next": skills that would unlock the most cohort vacancies.
  @Get(":id/recommendations")
  async recommendations(@Param("id") id: string): Promise<RecommendResponse> {
    const { matched, role, seniority } = await this.loader.getRecommendInput(id);
    const roleNodeId = await this.ranking.resolveRole(role);
    return this.recommendation.recommend(matched, roleNodeId, seniority);
  }

  // "You probably also know X": skills implied by the ones the CV listed.
  @Get(":id/skill-suggestions")
  skillSuggestions(@Param("id") id: string): Promise<SkillSuggestion[]> {
    return this.additionalSkills.suggest(id);
  }

  // Add a skill (confirmed suggestion or manual search-add); returns the set.
  @Post(":id/skills")
  @Throttle(CV_THROTTLE)
  async addSkill(
    @Param("id") id: string,
    @Body() body: { nodeId?: unknown } | undefined,
  ): Promise<CandidateNodeRef[]> {
    return this.loader.confirmSkill(id, await this.resolveSkillNode(body?.nodeId));
  }

  // Dismiss a suggestion so it never resurfaces for this candidate.
  @Post(":id/skills/reject")
  @Throttle(CV_THROTTLE)
  async rejectSkill(
    @Param("id") id: string,
    @Body() body: { nodeId?: unknown } | undefined,
  ): Promise<{ ok: true }> {
    await this.loader.rejectSuggestion(id, await this.resolveSkillNode(body?.nodeId));
    return { ok: true };
  }

  // Remove a skill from the candidate; returns the remaining skill set.
  @Delete(":id/skills/:nodeId")
  async removeSkill(
    @Param("id") id: string,
    @Param("nodeId") nodeId: string,
  ): Promise<CandidateNodeRef[]> {
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
