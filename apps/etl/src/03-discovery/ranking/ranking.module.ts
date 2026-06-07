import { Module } from "@nestjs/common";

import { RankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";

@Module({
  providers: [RankingService],
  controllers: [RankingController],
  exports: [RankingService],
})
export class RankingModule {}
