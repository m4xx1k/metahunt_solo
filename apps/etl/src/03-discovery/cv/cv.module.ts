import { Module } from "@nestjs/common";

import { AuthModule } from "../../platform/auth/auth.module";
import { NodeSlugModule } from "../../platform/nodes/node-slug.module";
import { RankingModule } from "../ranking/ranking.module";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CANDIDATE_EXTRACTOR } from "./candidate-extractor.port";
import { CandidateLoaderService } from "./candidate-loader.service";
import { CandidateMatchService } from "./candidate-match.service";
import { BamlCandidateExtractor } from "./candidate.extractor";
import { CvController } from "./cv.controller";

@Module({
  imports: [AuthModule, RankingModule, NodeSlugModule],
  providers: [
    CandidateLoaderService,
    CandidateMatchService,
    AdditionalSkillsService,
    { provide: CANDIDATE_EXTRACTOR, useClass: BamlCandidateExtractor },
  ],
  controllers: [CvController],
  exports: [CandidateLoaderService, CandidateMatchService],
})
export class CvModule {}
