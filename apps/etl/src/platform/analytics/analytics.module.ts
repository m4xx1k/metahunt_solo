import { Global, Module } from "@nestjs/common";

import { AnalyticsService } from "./analytics.service";

// Global so any feature service can inject AnalyticsService without re-importing
// (mirrors DatabaseModule). AnalyticsService is the ONLY place that touches the
// PostHog SDK — feature code calls its domain methods, never capture() directly.
@Global()
@Module({
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
