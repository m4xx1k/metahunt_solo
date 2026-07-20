// Web-side wire types + fetcher for creating a Telegram subscription
// (POST /subscriptions). Source of truth:
// apps/etl/src/telegram/subscriptions.contract.ts. Hand-mirrored per ADR-0005.

import { apiPost } from "./client";
import type { FitTier } from "./ranking";
import type {
  EmploymentType,
  EnglishLevel,
  ListVacanciesQuery,
  Seniority,
  WorkFormat,
} from "./vacancies";

// Mirrors apps/etl .../subscriptions.contract.ts. Feed sub = SubscriptionParams;
// CV sub = CvMatchParams + a candidateId.
export type SubscriptionParams = Omit<ListVacanciesQuery, "page" | "pageSize">;

export interface CvMatchParams {
  seniorities?: Seniority[];
  workFormats?: WorkFormat[];
  englishLevels?: EnglishLevel[];
  employmentTypes?: EmploymentType[];
  // Persisted via FEED_PARAM_KEYS and replayed by the CV digest (paired with the
  // ETL matcher fix) so a warm sub re-matches on the domain + experience filters.
  domainIds?: string[];
  experienceYears?: string[];
  hasTestAssignment?: boolean;
  hasReservation?: boolean;
  minFitTier?: FitTier;
  postedWithinDays?: number;
}

export interface CreateSubscriptionResponse {
  id: string;
  /** `t.me/<bot>?start=<id>` — tap to link Telegram and activate. */
  deepLink: string;
}

export const subscriptionsApi = {
  create: (params: SubscriptionParams | CvMatchParams, candidateId?: string) =>
    apiPost<CreateSubscriptionResponse>(candidateId ? "/subscriptions/cv" : "/subscriptions", {
      params,
      candidateId,
    }),
};
