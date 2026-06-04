import { Module } from "@nestjs/common";

import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FacetsService } from "./facets.service";
import { RedirectController } from "./redirect.controller";

@Module({
  providers: [FeedService, FacetsService],
  controllers: [FeedController, RedirectController],
  exports: [FeedService],
})
export class FeedModule {}
