import { Global, Module } from "@nestjs/common";

import { AnalyticsOutboxDispatcher } from "./analytics-outbox.dispatcher";
import { AnalyticsOutboxStore } from "./analytics-outbox.store";
import { ANALYTICS_OUTBOX_WRITER, PRODUCT_EVENT_WRITER } from "./analytics.ports";
import { AnalyticsService } from "./analytics.service";
import { PostHogClient } from "./posthog.client";
import { ProductEventStore } from "./product-event.store";

// Global so any feature service can inject without re-importing (mirrors
// DatabaseModule). PostHogClient is the only thing in the process that holds a
// PostHog SDK instance; feature code calls its verbs, never capture() directly.
// The outbox writes the Postgres ledger and nothing else — one store, one
// writer, so the two can never disagree about who said what.
@Global()
@Module({
  providers: [
    AnalyticsService,
    PostHogClient,
    AnalyticsOutboxDispatcher,
    AnalyticsOutboxStore,
    ProductEventStore,
    { provide: ANALYTICS_OUTBOX_WRITER, useExisting: AnalyticsOutboxStore },
    { provide: PRODUCT_EVENT_WRITER, useExisting: ProductEventStore },
  ],
  exports: [AnalyticsService, PostHogClient, PRODUCT_EVENT_WRITER],
})
export class AnalyticsModule {}
