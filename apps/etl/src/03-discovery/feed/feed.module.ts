import { Module } from "@nestjs/common";

import { DedupModule } from "../../02-enrich/dedup/dedup.module";
import { NodeSlugModule } from "../../platform/nodes/node-slug.module";

import { FacetsService } from "./facets.service";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { RedirectController } from "./redirect.controller";

@Module({
  imports: [DedupModule, NodeSlugModule],
  providers: [FeedService, FacetsService],
  controllers: [FeedController, RedirectController],
  exports: [FeedService],
})
export class FeedModule {}
