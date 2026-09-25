/**
 * Wire contract for the operator-facing dedup dashboard.
 *
 * Kept free of NestJS / Drizzle / runtime imports so the web client can
 * import these types directly. Mirrors the style of
 * `apps/etl/src/03-discovery/feed/feed.contract.ts`.
 *
 * Design rule: the `dedup_reason` JSON column on `vacancies` stores
 * exactly the `DedupReason` shape below — no DB↔API mapping layer. When
 * the resolve algorithm changes, the UI sees the new explanation without
 * any contract or controller changes.
 */

import type { Currency, Seniority, WorkFormat } from "../../platform/shared/contract";

// ─────────────────────── Source / refs ────────────────────────

export interface SourceBadge {
  id: string;
  /** Stable machine code, e.g. `djinni`, `dou`. */
  code: string;
  /** Human label for badges and link CTAs. */
  displayName: string;
}

export interface SalaryRange {
  min: number | null;
  max: number | null;
  currency: Currency | null;
}

// ────────────────────────── DedupReason ───────────────────────
// Persisted verbatim in `vacancies.dedup_reason`. Null on the member that
// founded its position and on vacancies that have not been resolved yet.

export type DedupRule = "exact" | "repost" | "cross_source";

export interface DedupReason {
  /** exact = identical content; repost = same board, same job re-published; cross_source = same job on another board. */
  rule: DedupRule;
  /** The member this vacancy was linked to — the pair the "why merged" UI shows. */
  matchedAgainstVacancyId: string;
  /** Jaccard over normalized title tokens, seniority words excluded. */
  titleSim: number;
  /** Shared 5-word description shingles over the smaller side. */
  containment: number;
  /** Embedding cosine when it was known at decision time. */
  cosine: number | null;
  /** ISO-8601 timestamp of the decision. */
  decidedAt: string;
}

// ─────────────────── Group / member view models ────────────────

export interface UniqueVacancyMember {
  vacancyId: string;
  source: SourceBadge;
  externalId: string;
  /** Origin URL on the source site — drives the "open original" link. */
  externalUrl: string | null;
  title: string;
  publishedAt: string | null;
  isCanonical: boolean;
  /** `null` for the member that founded the group. */
  dedupReason: DedupReason | null;
}

export interface UniqueVacancyListItem {
  id: string;
  canonicalVacancyId: string;

  /** From the canonical Vacancy. */
  title: string;
  companyName: string | null;
  role: string | null;
  seniority: Seniority | null;
  workFormat: WorkFormat | null;
  salaryRange: SalaryRange | null;

  /** Distinct sources across members. */
  sources: SourceBadge[];
  sourceCount: number;
  vacancyCount: number;

  /** ISO-8601. From `unique_vacancies.first_seen_at` / `last_seen_at`. */
  firstSeenAt: string;
  lastSeenAt: string;

  /** Always present in list responses — UI inline-expands instead of refetching. */
  members: UniqueVacancyMember[];
}

// ─────────────────── Feed-facing group view ────────────────────
// Slim envelope for the public main-feed "show duplicates" drawer: just the
// group identity, counters, and members with their merge reasons — no metrics
// or pagination (a group is always returned whole).

export interface FeedDuplicateGroup {
  id: string;
  canonicalVacancyId: string;
  vacancyCount: number;
  sourceCount: number;
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
  /** Vacancies that ended up in a multi-source group. */
  inCrossSourceGroupCount: number;
}

export interface DedupMetrics {
  totalGroups: number;
  /** Groups with `source_count >= 2`. */
  crossSourceGroups: number;
  /** crossSourceGroups / totalGroups, 0..1. */
  crossSourceRatio: number;
  totalVacancies: number;
  /** Members that live in a multi-source group. */
  vacanciesInCrossSourceGroups: number;
  avgGroupSize: number;
  /** Linked members per rule. */
  ruleCounts: DedupRuleCounts;
  sourceBreakdown: DedupSourceBreakdown[];
}

// ───────────────────────── Query / response ────────────────────

export interface UniqueVacanciesQuery {
  /** Only return groups where `sourceCount >= 2`. */
  crossSource?: boolean;
  /** 1-based. Defaults to 1. */
  page?: number;
  /** Defaults to 25, max 100. */
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
