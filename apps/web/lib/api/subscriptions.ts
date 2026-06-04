// Web-side wire types + fetcher for creating a Telegram subscription
// (POST /subscriptions). Source of truth:
// apps/etl/src/telegram/subscriptions.contract.ts. Hand-mirrored per ADR-0005.

import { apiPost } from "./client";
import type { ListVacanciesQuery } from "./vacancies";

// A subscription stores the effective feed query (same filter the catalog list
// consumes) minus pagination — the matching workflow replays it verbatim.
export type SubscriptionParams = Omit<ListVacanciesQuery, "page" | "pageSize">;

export interface CreateSubscriptionResponse {
  id: string;
  /** `t.me/<bot>?start=<id>` — tap to link Telegram and activate. */
  deepLink: string;
}

export const subscriptionsApi = {
  create: (params: SubscriptionParams) =>
    apiPost<CreateSubscriptionResponse>("/subscriptions", { params }),
};
