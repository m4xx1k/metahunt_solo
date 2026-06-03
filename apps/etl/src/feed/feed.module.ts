import { Module } from "@nestjs/common";

import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FacetsService } from "./facets.service";

@Module({
  providers: [FeedService, FacetsService],
  controllers: [FeedController],
  exports: [FeedService],
})
export class FeedModule {}
