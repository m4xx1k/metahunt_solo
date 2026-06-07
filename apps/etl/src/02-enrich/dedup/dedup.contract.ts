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

// ───────────────────────── Confidence ─────────────────────────

// Tier of an auto-merge decision. `gold` — high semantic similarity
// corroborated by structural signals (company / skills / title overlap);
// `confirmed` — passed every structural gate and the 0.92 thresholds but
// without strong corroboration. The dashboard's `gold` view is the clean
// demo list; `confirmed` is the rest.
export type DedupConfidence = "gold" | "confirmed";

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
// Persisted verbatim in `vacancies.dedup_reason`. Null on canonical
// members and on vacancies that have not been resolved yet.

export interface DedupReason {
  /** Cosine similarity at decision time (1 - distance). */
  similarity: number;
  /**
   * The specific neighbour this vacancy was matched against (best ANN
   * hit). The group itself may contain other members, but the merge
   * decision is pairwise — knowing which pair triggered it is what the
   * "why merged" UI shows.
   */
  matchedAgainstVacancyId: string;
  /**
   * Structural pre-filter agreement at decision time. `null` for a
   * field means the field was absent on at least one side and was not
   * used as a (dis)proof signal — distinct from `false` (both sides
   * had a value and they disagreed; usually means the candidate would
   * have been filtered out, only surfaces in soft-confidence cases).
   */
  prefilterMatches: {
    role: boolean | null;
    seniority: boolean | null;
    workFormat: boolean | null;
    company: boolean | null;
    /** Absolute day gap between publishedAt of the two vacancies. */
    dateWindowDays: number;
  };
  confidence: DedupConfidence;
  /**
   * Structural corroboration of the matched pair, computed alongside the
   * semantic score. Decides the gold/confirmed tier and feeds the
   * "why merged" UI so a high similarity is never the sole justification.
   */
  corroboration: {
    /** Jaccard over required-skill node ids; 0 when either side has none. */
    skillJaccard: number;
    /** Jaccard over normalised title tokens. */
    titleJaccard: number;
    /** Both sides had a resolved company and they matched. */
    companyMatch: boolean;
  };
  /** e.g. `text-embedding-3-small`. Lets us re-evaluate if model changes. */
  embeddingModel: string;
  /** ISO-8601 timestamp of the resolve decision. */
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
  /**
   * Cosine similarity of this member's embedding to the group centroid.
   * `null` only for the canonical member (anchor of the group).
   */
  similarityToCentroid: number | null;
  /** `null` only for the canonical member. */
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

  /**
   * Weakest similarity-to-centroid across non-canonical members. Drives
   * a group-level confidence badge (`min < 0.92` → group has soft edges).
   * `null` for sole-member groups.
   */
  minSimilarity: number | null;

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

export interface DedupSimilarityBuckets {
  /** 0.85 ≤ x < 0.92 — flagged for review. */
  soft: number;
  /** 0.92 ≤ x < 0.95 — confident match. */
  hard: number;
  /** x ≥ 0.95 — near-identical. */
  veryHard: number;
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
  similarityBuckets: DedupSimilarityBuckets;
  sourceBreakdown: DedupSourceBreakdown[];
}

// ───────────────────────── Query / response ────────────────────

export interface UniqueVacanciesQuery {
  /** Only return groups where `sourceCount >= 2`. */
  crossSource?: boolean;
  /** Group-level lower bound on `minSimilarity` (so weakest-edge filter). */
  minSimilarity?: number;
  /** Tier filter: `gold` = every edge gold; `confirmed` = has a confirmed edge. */
  confidence?: DedupConfidence | "all";
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
