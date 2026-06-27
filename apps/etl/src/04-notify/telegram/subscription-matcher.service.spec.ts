import { Test } from "@nestjs/testing";

import { CandidateLoaderService } from "../../03-discovery/cv/candidate-loader.service";
import type { FeedResponse, VacancyDto } from "../../03-discovery/feed/feed.contract";
import { FeedService } from "../../03-discovery/feed/feed.service";
import type { MatchResponse } from "../../03-discovery/ranking/ranking.contract";
import { RankingService } from "../../03-discovery/ranking/ranking.service";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionMatcherService } from "./subscription-matcher.service";
import {
  SubscriptionsService,
  type SubscriptionMatchTarget,
} from "./subscriptions.service";

const DAY_MS = 86_400_000;
const SCAN_WINDOW_DAYS = 14;

function createVacancy(id: string): VacancyDto {
  return {
    id,
    externalId: "ext",
    rssRecordId: "rss",
    source: { id: "s", code: "djinni", displayName: "Djinni" },
    link: null,
    publishedAt: null,
    loadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: `Job ${id}`,
    description: null,
    company: null,
    role: null,
    domain: null,
    skills: { required: [], optional: [] },
    seniority: null,
    workFormat: null,
    employmentType: null,
    englishLevel: null,
    experienceYears: null,
    engagementType: null,
    hasTestAssignment: null,
    hasReservation: null,
    salary: { min: null, max: null, currency: null },
    locations: [],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
  };
}

function feedResponse(items: VacancyDto[], total = items.length): FeedResponse {
  return { items, page: 1, pageSize: 50, total };
}

function matchResponse(items: VacancyDto[], total = items.length): MatchResponse {
  return {
    resolved: { matched: [], unmatched: [] },
    items: items.map((vacancy) => ({
      vacancy,
      relevance: 1,
      onStack: true,
      fit: { tier: "STRONG", matchedRequired: 1, requiredTotal: 1 },
      diff: { have: [], missing: [], bonus: [] },
    })),
    page: 1,
    pageSize: 50,
    total,
  };
}

function target(
  overrides: Partial<SubscriptionMatchTarget> = {},
): SubscriptionMatchTarget {
  return {
    id: "sub-1",
    candidateId: null,
    params: { roleIds: ["r1"] },
    createdAt: new Date(Date.now() - DAY_MS),
    ...overrides,
  };
}

describe("SubscriptionMatcherService", () => {
  const search = jest.fn();
  const rankByRefs = jest.fn();
  const getMatchInput = jest.fn();
  const sentVacancyIds = jest.fn();
  const describe_ = jest.fn();
  let service: SubscriptionMatcherService;

  beforeEach(async () => {
    search.mockReset().mockResolvedValue(feedResponse([]));
    rankByRefs.mockReset().mockResolvedValue(matchResponse([]));
    getMatchInput.mockReset().mockResolvedValue({ matched: [], unmatched: [] });
    sentVacancyIds.mockReset().mockResolvedValue([]);
    describe_.mockReset().mockResolvedValue("Backend");

    const moduleRef = await Test.createTestingModule({
      providers: [
        SubscriptionMatcherService,
        { provide: FeedService, useValue: { search } },
        { provide: RankingService, useValue: { rankByRefs } },
        { provide: CandidateLoaderService, useValue: { getMatchInput } },
        { provide: SubscriptionsService, useValue: { describe: describe_ } },
        { provide: SentNotificationsService, useValue: { sentVacancyIds } },
      ],
    }).compile();
    service = moduleRef.get(SubscriptionMatcherService);
  });

  describe("matchNew — filter sub", () => {
    it("scans from createdAt when it's within the window", async () => {
      const sub = target();
      await service.matchNew(sub);

      expect(sentVacancyIds).toHaveBeenCalledWith(sub.id, sub.createdAt);
      expect(search.mock.calls[0][0].loadedAfter).toBe(sub.createdAt);
    });

    it("floors the scan at the window when the sub is older", async () => {
      await service.matchNew(
        target({ createdAt: new Date(Date.now() - 100 * DAY_MS) }),
      );

      const expected = Date.now() - SCAN_WINDOW_DAYS * DAY_MS;
      expect(
        Math.abs(search.mock.calls[0][0].loadedAfter.getTime() - expected),
      ).toBeLessThan(5000);
    });

    it("passes the already-sent ids as the anti-join exclusion", async () => {
      sentVacancyIds.mockResolvedValue(["a", "b"]);
      await service.matchNew(target());

      expect(search.mock.calls[0][0].excludeIds).toEqual(["a", "b"]);
    });
  });

  describe("matchNew — CV sub", () => {
    const cvSub = (params: Record<string, unknown> = {}) =>
      target({ candidateId: "cand-1", params });

    it("ranks against the candidate's CV, not the feed query", async () => {
      getMatchInput.mockResolvedValue({
        matched: [{ id: "n1", name: "Go", weight: 2 }],
        unmatched: [],
      });
      rankByRefs.mockResolvedValue(matchResponse([createVacancy("v1")], 1));

      const res = await service.matchNew(cvSub());

      expect(getMatchInput).toHaveBeenCalledWith("cand-1");
      expect(search).not.toHaveBeenCalled();
      expect(res.items.map((v) => v.id)).toEqual(["v1"]);
    });

    it("defaults the fit gate to GOOD and applies the new-since/anti-join window", async () => {
      sentVacancyIds.mockResolvedValue(["x"]);
      const sub = cvSub();
      await service.matchNew(sub);

      const [, filters] = rankByRefs.mock.calls[0];
      expect(filters.minFitTier).toBe("GOOD");
      expect(filters.loadedAfter).toBe(sub.createdAt);
      expect(filters.excludeIds).toEqual(["x"]);
    });

    it("respects a subscription's own minFitTier override", async () => {
      await service.matchNew(cvSub({ minFitTier: "STRONG" }));

      expect(rankByRefs.mock.calls[0][1].minFitTier).toBe("STRONG");
    });
  });

  describe("sample", () => {
    it("ignores the floor and anti-join, scanning a flat window", async () => {
      sentVacancyIds.mockResolvedValue(["sent"]);
      await service.sample(target(), 7);

      expect(sentVacancyIds).not.toHaveBeenCalled();
      const arg = search.mock.calls[0][0];
      expect(arg.excludeIds).toEqual([]);
      const expected = Date.now() - 7 * DAY_MS;
      expect(Math.abs(arg.loadedAfter.getTime() - expected)).toBeLessThan(5000);
    });
  });
});
