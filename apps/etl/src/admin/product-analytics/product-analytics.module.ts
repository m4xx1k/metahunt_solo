import { Module } from "@nestjs/common";

import { PostHogQueryClient } from "../../platform/analytics/posthog-query.client";
import { AuthModule } from "../../platform/auth/auth.module";

import { ProductAnalyticsController } from "./product-analytics.controller";
import { ProductAnalyticsService } from "./product-analytics.service";

@Module({
  imports: [AuthModule],
  controllers: [ProductAnalyticsController],
  providers: [ProductAnalyticsService, PostHogQueryClient],
})
export class ProductAnalyticsModule {}
