// Web-side wire types + fetcher for the operator dedup dashboard.
// Source of truth: apps/etl/src/dedup/dedup.contract.ts.
// Hand-mirrored per ADR-0005 (no shared libs/contracts/ until 2nd consumer).

import type { Currency, Seniority, WorkFormat } from "./vacancies";
import { apiGet, buildQs } from "./client";

// ───────────────────────── Confidence ─────────────────────────

// `gold` — high similarity corroborated by a structural signal;
// `confirmed` — passed every gate but weaker corroboration.
export type DedupConfidence = "gold" | "confirmed";

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

export interface DedupReason {
  similarity: number;
  matchedAgainstVacancyId: string;
  prefilterMatches: {
    role: boolean | null;
    seniority: boolean | null;
    workFormat: boolean | null;
    company: boolean | null;
    dateWindowDays: number;
  };
  confidence: DedupConfidence;
  corroboration: {
    skillJaccard: number;
    titleJaccard: number;
    companyMatch: boolean;
  };
  embeddingModel: string;
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
  similarityToCentroid: number | null;
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
  minSimilarity: number | null;
  members: UniqueVacancyMember[];
}

// ──────────────────────── Metrics panel ────────────────────────

export interface DedupSimilarityBuckets {
  soft: number;
  hard: number;
  veryHard: number;
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
  similarityBuckets: DedupSimilarityBuckets;
  sourceBreakdown: DedupSourceBreakdown[];
}

// ───────────────────────── Query / response ────────────────────

export interface UniqueVacanciesQuery {
  crossSource?: boolean;
  minSimilarity?: number;
  confidence?: DedupConfidence | "all";
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
    apiGet<UniqueVacanciesResponse>(
      `/operator/unique-vacancies${buildQs(q)}`,
    ),
};
