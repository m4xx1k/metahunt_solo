import type { ConfigService } from "@nestjs/config";

import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsOutboxStore } from "../../src/platform/analytics/analytics-outbox.store";
import { AnalyticsService } from "../../src/platform/analytics/analytics.service";
import { ProductAnalyticsService } from "../../src/platform/analytics/product-analytics.service";
import { ProductEventStore } from "../../src/platform/analytics/product-event.store";

// Built without POSTHOG_API_KEY, so every capture() is a no-op by construction —
// integration tests must never reach the real project.
export function dormantProductAnalytics(): ProductAnalyticsService {
  return new ProductAnalyticsService({ get: () => undefined } as unknown as ConfigService);
}

// No-op analytics for tests that construct RankingService but don't assert on emitted events.
export function noopAnalytics(db: DrizzleDB): AnalyticsService {
  return new AnalyticsService(
    new ProductEventStore(db),
    new AnalyticsOutboxStore(db),
    { capture: () => undefined, alias: () => undefined },
    dormantProductAnalytics(),
  );
}
