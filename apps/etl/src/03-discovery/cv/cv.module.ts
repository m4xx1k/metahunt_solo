import { Module } from "@nestjs/common";

import { NodeSlugModule } from "../../platform/nodes/node-slug.module";
import { RankingModule } from "../ranking/ranking.module";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CANDIDATE_EXTRACTOR } from "./candidate-extractor.port";
import { CandidateLoaderService } from "./candidate-loader.service";
import { BamlCandidateExtractor } from "./candidate.extractor";
import { CvController } from "./cv.controller";

@Module({
  imports: [RankingModule, NodeSlugModule],
  providers: [
    CandidateLoaderService,
    AdditionalSkillsService,
    { provide: CANDIDATE_EXTRACTOR, useClass: BamlCandidateExtractor },
  ],
  controllers: [CvController],
  exports: [CandidateLoaderService], // for the Telegram CV-sub digest
})
export class CvModule {}
