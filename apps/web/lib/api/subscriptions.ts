// Web-side wire types + fetcher for creating a Telegram subscription
// (POST /subscriptions). Source of truth:
// apps/etl/src/platform/subscriptions/subscription.contract.ts. Hand-mirrored
// per ADR-0005.

import { getOrCreateJourneyId } from "@/lib/analytics/journey";

import { apiPost } from "./client";
import type { SubscriptionFilter } from "./filters";

export type { SubscriptionFilter } from "./filters";

export interface CreateSubscriptionResponse {
  id: string;
  /** `t.me/<bot>?start=<id>` — tap to link Telegram and activate. */
  deepLink: string;
}

export const subscriptionsApi = {
  // The journey id ties this subscriber back to the anonymous visit that
  // created them — without it the web and Telegram halves stay two people.
  create: (params: SubscriptionFilter) =>
    apiPost<CreateSubscriptionResponse>("/subscriptions", {
      params,
      journeyId: getOrCreateJourneyId(),
    }),
};
