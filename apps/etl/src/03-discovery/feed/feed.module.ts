import { Module } from "@nestjs/common";

import { DedupModule } from "../../02-enrich/dedup/dedup.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FacetsService } from "./facets.service";
import { RedirectController } from "./redirect.controller";

@Module({
  imports: [DedupModule],
  providers: [FeedService, FacetsService],
  controllers: [FeedController, RedirectController],
  exports: [FeedService],
})
export class FeedModule {}
