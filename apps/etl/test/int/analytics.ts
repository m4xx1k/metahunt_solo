import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsOutboxStore } from "../../src/platform/analytics/analytics-outbox.store";
import { AnalyticsService } from "../../src/platform/analytics/analytics.service";
import { ProductEventStore } from "../../src/platform/analytics/product-event.store";

// No-op analytics for tests that construct RankingService but don't assert on emitted events.
export function noopAnalytics(db: DrizzleDB): AnalyticsService {
  return new AnalyticsService(new ProductEventStore(db), new AnalyticsOutboxStore(db), {
    capture: () => undefined,
  });
}
