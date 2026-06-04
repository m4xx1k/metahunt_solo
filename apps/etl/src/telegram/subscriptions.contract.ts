/**
 * Wire contract for creating a subscription from the web facet UI.
 *
 * Kept free of NestJS / Drizzle imports so the web client can hand-mirror
 * these types (ADR-0005: no shared contracts lib until a 2nd consumer).
 *
 * `params` is the effective feed query (the same shape `GET /feed` consumes,
 * minus pagination). The matching workflow replays it through the catalog
 * `list()`, so "what I filtered in the catalog == what I get notified about".
 */

// The filter keys we persist. Anything else in the request body is dropped —
// `params` stays a clean, replayable feed query.
export const SUBSCRIPTION_PARAM_KEYS = [
  "q",
  "sourceId",
  "companyId",
  "roleId",
  "roleIds",
  "skillIds",
  "seniority",
  "workFormat",
  "employmentType",
  "englishLevel",
  "engagementType",
  "experienceMin",
  "experienceMax",
  "salaryFloor",
  "currency",
  "hasTestAssignment",
  "hasReservation",
  "includeRoleless",
  "includeAllSkills",
] as const;

export type SubscriptionParamKey = (typeof SUBSCRIPTION_PARAM_KEYS)[number];

export type SubscriptionParams = Partial<Record<SubscriptionParamKey, unknown>>;

export interface CreateSubscriptionRequest {
  params: SubscriptionParams;
}

export interface CreateSubscriptionResponse {
  id: string;
  /** `t.me/<bot>?start=<id>` — the user taps this to link Telegram and activate. */
  deepLink: string;
}
