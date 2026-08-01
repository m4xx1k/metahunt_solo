import { Injectable } from "@nestjs/common";

import { NodeSlugResolver } from "../../platform/nodes/node-slug.resolver";
import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "../../platform/shared/contract";
import type { FitTier, MatchResponse, MatchSort } from "../ranking/ranking.contract";
import { RankingService } from "../ranking/ranking.service";

import { CandidateLoaderService } from "./candidate-loader.service";

export interface CandidateMatchCriteria {
  seniorities?: Seniority[];
  workFormats?: WorkFormat[];
  englishLevels?: EnglishLevel[];
  employmentTypes?: EmploymentType[];
  domainRefs?: string[];
  roleRefs?: string[];
  excludedSkillRefs?: string[];
  experienceYears?: string[];
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  minFitTier?: FitTier;
  sort?: MatchSort;
  sourceId?: string;
  postedWithinDays?: number;
  loadedAfter?: Date;
  excludeIds?: string[];
}

@Injectable()
export class CandidateMatchService {
  constructor(
    private readonly candidates: CandidateLoaderService,
    private readonly ranking: RankingService,
    private readonly slugs: NodeSlugResolver,
  ) {}

  async match(
    candidateId: string,
    criteria: CandidateMatchCriteria,
    page: number,
    pageSize: number,
  ): Promise<MatchResponse> {
    const [refs, domainIds, roleNodeIds, excludedSkillNodeIds] = await Promise.all([
      this.candidates.getMatchInput(candidateId),
      this.slugs.toIds("DOMAIN", criteria.domainRefs),
      this.slugs.toIds("ROLE", criteria.roleRefs),
      this.slugs.toIds("SKILL", criteria.excludedSkillRefs),
    ]);

    return this.ranking.rankByRefs(
      refs,
      {
        seniorities: criteria.seniorities,
        workFormats: criteria.workFormats,
        englishLevels: criteria.englishLevels,
        employmentTypes: criteria.employmentTypes,
        domainIds,
        roleNodeIds,
        excludedSkillNodeIds,
        experienceYears: criteria.experienceYears,
        hasTestAssignment: criteria.hasTestAssignment,
        hasReservation: criteria.hasReservation,
        minFitTier: criteria.minFitTier,
        sort: criteria.sort,
        sourceId: criteria.sourceId,
        postedWithinDays: criteria.postedWithinDays,
        loadedAfter: criteria.loadedAfter,
        excludeIds: criteria.excludeIds,
      },
      page,
      pageSize,
    );
  }
}
