import { Module } from "@nestjs/common";

import { RankingModule } from "../ranking/ranking.module";
import { CandidateExtractor } from "./candidate.extractor";
import { CandidateLoaderService } from "./candidate-loader.service";
import { CvController } from "./cv.controller";

@Module({
  imports: [RankingModule],
  providers: [CandidateLoaderService, CandidateExtractor],
  controllers: [CvController],
})
export class CvModule {}
