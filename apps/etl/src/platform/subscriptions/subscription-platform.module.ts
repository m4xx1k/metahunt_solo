import { Module } from "@nestjs/common";

import { NodeSlugModule } from "../nodes/node-slug.module";

import { SubscriptionCriteriaService } from "./subscription-criteria.service";

@Module({
  imports: [NodeSlugModule],
  providers: [SubscriptionCriteriaService],
  exports: [SubscriptionCriteriaService],
})
export class SubscriptionPlatformModule {}
