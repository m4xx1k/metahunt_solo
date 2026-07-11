import { Module } from "@nestjs/common";

import { NodeSlugModule } from "../../platform/nodes/node-slug.module";
import { RankingModule } from "../ranking/ranking.module";

import { AdditionalSkillsService } from "./additional-skills.service";
import { CANDIDATE_EXTRACTOR } from "./candidate-extractor.port";
import { CandidateLoaderService } from "./candidate-loader.service";
import { BamlCandidateExtractor } from "./candidate.extractor";
import { tailorRephraserProvider } from "./cv-tailor.rephraser.provider";
import { CvTailorService } from "./cv-tailor.service";
import { CvController } from "./cv.controller";

@Module({
  imports: [RankingModule, NodeSlugModule],
  providers: [
    CandidateLoaderService,
    AdditionalSkillsService,
    CvTailorService,
    tailorRephraserProvider, // gated LLM rephrase; absent unless CV_TAILOR_LLM=1
    { provide: CANDIDATE_EXTRACTOR, useClass: BamlCandidateExtractor },
  ],
  controllers: [CvController],
  exports: [CandidateLoaderService], // for the Telegram CV-sub digest
})
export class CvModule {}
