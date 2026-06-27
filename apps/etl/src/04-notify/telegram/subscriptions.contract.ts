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

// Feed-filter sub: the effective feed query, replayed through FeedService.search.
export const FEED_PARAM_KEYS = [
  "q",
  "sourceId",
  "companyId",
  "roleId",
  "roleIds",
  "skillIds",
  "domainIds",
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

// CV sub: reverse-ATS match filters (arrays + fit tier). Shared keys
// (hasTestAssignment/hasReservation/sourceId) already live in FEED_PARAM_KEYS.
export const CV_MATCH_PARAM_KEYS = [
  "seniorities",
  "workFormats",
  "englishLevels",
  "employmentTypes",
  "minFitTier",
  "postedWithinDays",
] as const;

// Persisted whitelist; anything else in the body is dropped.
export const SUBSCRIPTION_PARAM_KEYS = [
  ...FEED_PARAM_KEYS,
  ...CV_MATCH_PARAM_KEYS,
] as const;

export type SubscriptionParamKey = (typeof SUBSCRIPTION_PARAM_KEYS)[number];

export type SubscriptionParams = Partial<Record<SubscriptionParamKey, unknown>>;

export interface CreateSubscriptionRequest {
  params: SubscriptionParams;
  /** Set for a CV (reverse-ATS) sub. */
  candidateId?: string;
}

export interface CreateSubscriptionResponse {
  id: string;
  /** `t.me/<bot>?start=<id>` — the user taps this to link Telegram and activate. */
  deepLink: string;
}
