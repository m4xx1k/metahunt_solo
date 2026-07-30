export const FEED_PARAM_KEYS = [
  "q",
  "sourceId",
  "companyId",
  "roleId",
  "roleIds",
  "skillIds",
  "excludedSkillIds",
  "domainIds",
  "seniority",
  "workFormat",
  "employmentType",
  "englishLevel",
  "engagementType",
  "experienceYears",
  "salaryFloor",
  "currency",
  "hasTestAssignment",
  "hasReservation",
  "includeRoleless",
  "includeAllSkills",
] as const;

export const CV_MATCH_PARAM_KEYS = [
  "seniorities",
  "workFormats",
  "englishLevels",
  "employmentTypes",
  "minFitTier",
  "postedWithinDays",
] as const;

export const SUBSCRIPTION_PARAM_KEYS = [...FEED_PARAM_KEYS, ...CV_MATCH_PARAM_KEYS] as const;

export type SubscriptionParamKey = (typeof SUBSCRIPTION_PARAM_KEYS)[number];
export type SubscriptionParams = Partial<Record<SubscriptionParamKey, unknown>>;

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
