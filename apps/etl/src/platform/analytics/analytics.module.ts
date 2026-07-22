import { Global, Module } from "@nestjs/common";

import { AnalyticsOutboxDispatcher } from "./analytics-outbox.dispatcher";
import { AnalyticsOutboxStore } from "./analytics-outbox.store";
import { AnalyticsController } from "./analytics.controller";
import { ANALYTICS_OUTBOX_WRITER, ANALYTICS_SINK, PRODUCT_EVENT_WRITER } from "./analytics.ports";
import { AnalyticsService } from "./analytics.service";
import { PostHogSink } from "./posthog.sink";
import { ProductEventStore } from "./product-event.store";

// Global so any feature service can inject AnalyticsService without re-importing
// (mirrors DatabaseModule). AnalyticsService is the ONLY place that touches the
// PostHog SDK — feature code calls its domain methods, never capture() directly.
@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsOutboxDispatcher,
    AnalyticsOutboxStore,
    ProductEventStore,
    PostHogSink,
    { provide: ANALYTICS_OUTBOX_WRITER, useExisting: AnalyticsOutboxStore },
    { provide: PRODUCT_EVENT_WRITER, useExisting: ProductEventStore },
    { provide: ANALYTICS_SINK, useExisting: PostHogSink },
  ],
  exports: [AnalyticsService, PRODUCT_EVENT_WRITER],
})
export class AnalyticsModule {}
