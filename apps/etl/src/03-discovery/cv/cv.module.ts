import { Module } from "@nestjs/common";

import { RankingModule } from "../ranking/ranking.module";
import { BamlCandidateExtractor } from "./candidate.extractor";
import { CANDIDATE_EXTRACTOR } from "./candidate-extractor.port";
import { CandidateLoaderService } from "./candidate-loader.service";
import { CvController } from "./cv.controller";

@Module({
  imports: [RankingModule],
  providers: [
    CandidateLoaderService,
    { provide: CANDIDATE_EXTRACTOR, useClass: BamlCandidateExtractor },
  ],
  controllers: [CvController],
  exports: [CandidateLoaderService], // for the Telegram CV-sub digest

})
export class CvModule {}
