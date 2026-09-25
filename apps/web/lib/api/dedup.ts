// Web-side wire types + fetcher for the operator dedup dashboard.
// Source of truth: apps/etl/src/02-enrich/dedup/dedup.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import type { Currency, Seniority, WorkFormat } from "./vacancies";
import { apiGet, apiPost, buildQs } from "./client";

// ─────────────────────── Source / refs ────────────────────────

export interface SourceBadge {
  id: string;
  code: string;
  displayName: string;
}

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: Currency | null;
}

// ────────────────────────── DedupReason ───────────────────────

export type DedupRule = "exact" | "repost" | "cross_source";

export interface DedupReason {
  rule: DedupRule;
  matchedAgainstVacancyId: string;
  titleSim: number;
  containment: number;
  cosine: number | null;
  decidedAt: string;
}

// ─────────────────── Group / member view models ────────────────

export interface UniqueVacancyMember {
  vacancyId: string;
  source: SourceBadge;
  externalId: string;
  externalUrl: string | null;
  title: string;
  publishedAt: string | null;
  isCanonical: boolean;
  dedupReason: DedupReason | null;
}

export interface UniqueVacancyListItem {
  id: string;
  canonicalVacancyId: string;
  title: string;
  companyName: string | null;
  role: string | null;
  seniority: Seniority | null;
  workFormat: WorkFormat | null;
  salaryRange: SalaryRange | null;
  sources: SourceBadge[];
  sourceCount: number;
  vacancyCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  members: UniqueVacancyMember[];
}

// ──────────────────────── Metrics panel ────────────────────────

export interface DedupRuleCounts {
  exact: number;
  repost: number;
  crossSource: number;
}

export interface DedupSourceBreakdown {
  sourceCode: string;
  sourceDisplayName: string;
  vacancyCount: number;
  inCrossSourceGroupCount: number;
}

export interface DedupMetrics {
  totalGroups: number;
  crossSourceGroups: number;
  crossSourceRatio: number;
  totalVacancies: number;
  vacanciesInCrossSourceGroups: number;
  avgGroupSize: number;
  ruleCounts: DedupRuleCounts;
  sourceBreakdown: DedupSourceBreakdown[];
}

// ───────────────────────── Query / response ────────────────────

export interface UniqueVacanciesQuery {
  crossSource?: boolean;
  page?: number;
  pageSize?: number;
}

export interface UniqueVacanciesResponse {
  metrics: DedupMetrics;
  items: UniqueVacancyListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// ─────────────────────────── Fetcher ────────────────────────────

export const dedupApi = {
  list: (q: UniqueVacanciesQuery = {}) =>
    apiGet<UniqueVacanciesResponse>(`/operator/unique-vacancies${buildQs(q)}`),
  detach: (groupId: string, vacancyId: string) =>
    apiPost<{ groupId: string }>(`/operator/unique-vacancies/${groupId}/detach`, { vacancyId }),
};
