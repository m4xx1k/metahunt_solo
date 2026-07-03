import { Module } from "@nestjs/common";

import { NodeSlugModule } from "../../platform/nodes/node-slug.module";
import { FeedModule } from "../feed/feed.module";
import { RankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";
import { RecommendationService } from "./recommendation.service";

@Module({
  imports: [FeedModule, NodeSlugModule],
  providers: [RankingService, RecommendationService],
  controllers: [RankingController],
  exports: [RankingService, RecommendationService],
})
export class RankingModule {}
