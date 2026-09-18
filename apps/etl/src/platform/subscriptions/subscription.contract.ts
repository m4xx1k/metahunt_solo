import type { SubscriptionFilterDto } from "../shared/filter-params.dto";

/**
 * Every key a subscription persists — the jsonb whitelist, and the identity the
 * create/update dedup compares on. Pinned to `SubscriptionFilterDto` so the
 * stored shape and the validated shape cannot drift apart.
 *
 * Deliberately absent: paging and `sort` (a digest has no page to order),
 * `minFitTier` (a no-op without a scorer, yet still part of the identity),
 * `postedWithinDays` (the digest floor already owns time) and the browsing
 * affordances. See the axes in filter-params.dto.ts.
 */
export const SUBSCRIPTION_PARAM_KEYS = [
  "sourceId",
  "roleIds",
  "skillIds",
  "excludedSkillIds",
  "domainIds",
  "seniorities",
  "workFormats",
  "englishLevels",
  "employmentTypes",
  "experienceYears",
  "hasTestAssignment",
  "hasReservation",
] as const satisfies readonly (keyof SubscriptionFilterDto)[];

export type SubscriptionParamKey = (typeof SUBSCRIPTION_PARAM_KEYS)[number];

/** The stored filter. Values arrive from jsonb, so readers still coerce. */
export type SubscriptionParams = Partial<Pick<SubscriptionFilterDto, SubscriptionParamKey>>;

export interface CreateSubscriptionRequest {
  params: SubscriptionParams;
  candidateId?: string;
  journeyId?: string;
}

export interface CreateSubscriptionResponse {
  id: string;
  deepLink: string;
}

export function createSubscriptionResponse(
  botUsername: string,
  subscriptionId: string,
): CreateSubscriptionResponse {
  return {
    id: subscriptionId,
    deepLink: `https://t.me/${botUsername}?start=${subscriptionId}`,
  };
}
