import { Injectable, Logger } from "@nestjs/common";

import { CandidateLoaderService } from "../../03-discovery/cv/candidate-loader.service";
import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import { FeedService, type FeedSearchParams } from "../../03-discovery/feed/feed.service";
import type {
  FitTier,
  MatchFilters,
} from "../../03-discovery/ranking/ranking.contract";
import { RankingService } from "../../03-discovery/ranking/ranking.service";
import {
  asBoolean,
  asNumber,
  asString,
  asStringArray,
} from "../../platform/shared/coerce";
import type {
  EmploymentType,
  EnglishLevel,
  Seniority,
  WorkFormat,
} from "../../platform/shared/contract";
import type { SubscriptionParams } from "./subscriptions.contract";
import {
  SubscriptionsService,
  type SubscriptionMatchTarget,
} from "./subscriptions.service";
import { SentNotificationsService } from "./sent-notifications.service";

const DAY_MS = 86_400_000;

// Scan window: a perf floor only; correctness is the sent_notifications
// anti-join, also capped per-subscriber by created_at.
const SCAN_WINDOW_DAYS = 14;
const MAX_VACANCIES_PER_RUN = 50;

// CV digests notify on STRONG+GOOD unless the sub overrides via stored minFitTier.
const DEFAULT_CV_MIN_FIT: FitTier = "GOOD";

export interface DigestMatch {
  items: VacancyDto[];
  /** Full match count (may exceed items.length when capped); drives the header. */
  total: number;
  /** Human label for the header. */
  label: string;
}

// Matches a subscription against vacancies — the shared core of scheduled
// delivery (matchNew) and on-demand preview (sample). No transport here, so it
// stays free of the DigestService → Telegram → handler cycle.
@Injectable()
export class SubscriptionMatcherService {
  private readonly logger = new Logger(SubscriptionMatcherService.name);

  constructor(
    private readonly feed: FeedService,
    private readonly ranking: RankingService,
    private readonly candidates: CandidateLoaderService,
    private readonly subscriptions: SubscriptionsService,
    private readonly sentNotifications: SentNotificationsService,
  ) {}

  // New vacancies to deliver: loaded after the sub's floor, not yet sent.
  async matchNew(sub: SubscriptionMatchTarget): Promise<DigestMatch> {
    const floor = candidateFloor(sub.createdAt);
    const excludeIds = await this.sentNotifications.sentVacancyIds(sub.id, floor);
    return this.match(sub, floor, excludeIds);
  }

  // Example over a flat window, ignoring the floor and the sent anti-join.
  async sample(
    sub: SubscriptionMatchTarget,
    windowDays: number,
  ): Promise<DigestMatch> {
    return this.match(sub, new Date(Date.now() - windowDays * DAY_MS), []);
  }

  // CV subs rank against the resume; filter subs replay the feed query.
  private async match(
    sub: SubscriptionMatchTarget,
    loadedAfter: Date,
    excludeIds: string[],
  ): Promise<DigestMatch> {
    const result = sub.candidateId
      ? await this.matchByCv(sub, sub.candidateId, loadedAfter, excludeIds)
      : await this.matchByFilters(sub, loadedAfter, excludeIds);
    this.logger.log(
      `match sub ${sub.id}: ${sub.candidateId ? "cv" : "filter"} → ${result.total} since ${loadedAfter.toISOString()}`,
    );
    return result;
  }

  private async matchByFilters(
    sub: SubscriptionMatchTarget,
    loadedAfter: Date,
    excludeIds: string[],
  ): Promise<DigestMatch> {
    const [page, label] = await Promise.all([
      this.feed.search({
        ...(sub.params as Partial<FeedSearchParams>),
        page: 1,
        pageSize: MAX_VACANCIES_PER_RUN,
        loadedAfter,
        excludeIds,
      }),
      this.subscriptions.describe(sub.params),
    ]);
    return { items: page.items, total: page.total, label };
  }

  private async matchByCv(
    sub: SubscriptionMatchTarget,
    candidateId: string,
    loadedAfter: Date,
    excludeIds: string[],
  ): Promise<DigestMatch> {
    const refs = await this.candidates.getMatchInput(candidateId);
    const filters = paramsToMatchFilters(sub.params);
    const [res, label] = await Promise.all([
      this.ranking.rankByRefs(
        refs,
        {
          ...filters,
          minFitTier: filters.minFitTier ?? DEFAULT_CV_MIN_FIT,
          loadedAfter,
          excludeIds,
        },
        1,
        MAX_VACANCIES_PER_RUN,
      ),
      this.subscriptions.describe(sub.params, candidateId),
    ]);
    return { items: res.items.map((i) => i.vacancy), total: res.total, label };
  }
}

// Floor = later of the sub's createdAt and the window start — never notify
// about pre-subscription vacancies, never scan past the window.
function candidateFloor(createdAt: Date): Date {
  const windowStart = new Date(Date.now() - SCAN_WINDOW_DAYS * DAY_MS);
  return createdAt > windowStart ? createdAt : windowStart;
}

// Stored params (a jsonb bag, still unknown here) → RankingService MatchFilters.
// Empty arrays are fine — buildFilters treats them as "no filter".
function paramsToMatchFilters(params: SubscriptionParams): MatchFilters {
  return {
    seniorities: asStringArray(params.seniorities) as Seniority[],
    workFormats: asStringArray(params.workFormats) as WorkFormat[],
    englishLevels: asStringArray(params.englishLevels) as EnglishLevel[],
    employmentTypes: asStringArray(params.employmentTypes) as EmploymentType[],
    hasTestAssignment: asBoolean(params.hasTestAssignment),
    hasReservation: asBoolean(params.hasReservation),
    minFitTier: asString(params.minFitTier) as FitTier | undefined,
    sourceId: asString(params.sourceId),
    postedWithinDays: asNumber(params.postedWithinDays),
  };
}
