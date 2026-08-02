import { Module } from "@nestjs/common";

import { PostHogQueryClient } from "../../platform/analytics/posthog-query.client";
import { AuthModule } from "../../platform/auth/auth.module";

import { AnalyticsPageController } from "./analytics-page.controller";
import { AnalyticsPageService } from "./analytics-page.service";

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsPageController],
  providers: [AnalyticsPageService, PostHogQueryClient],
})
export class AnalyticsPageModule {}
