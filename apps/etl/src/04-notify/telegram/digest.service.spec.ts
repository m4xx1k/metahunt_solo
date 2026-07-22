import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import { AnalyticsService } from "../../platform/analytics/analytics.service";

import { DigestService } from "./digest.service";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionMatcherService, type DigestMatch } from "./subscription-matcher.service";
import { SubscriptionsService, type ActiveSubscription } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

const BASE = "https://api.metahunt.io";

function createVacancy(overrides: Partial<VacancyDto> = {}): VacancyDto {
  return {
    id: "v1",
    externalId: "ext",
    rssRecordId: "rss",
    source: { id: "s", code: "djinni", displayName: "Djinni" },
    link: "https://djinni.co/jobs/1",
    publishedAt: new Date().toISOString(),
    loadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: "Dev",
    description: null,
    company: null,
    role: { id: "r", name: "Backend Developer" },
    domain: null,
    skills: { required: [], optional: [] },
    seniority: "MIDDLE",
    workFormat: "REMOTE",
    employmentType: null,
    englishLevel: null,
    experienceYears: null,
    engagementType: null,
    hasTestAssignment: false,
    hasReservation: false,
    salary: { min: null, max: null, currency: null },
    locations: [],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
    ...overrides,
  };
}

function digestMatch(items: VacancyDto[], total = items.length): DigestMatch {
  return { items, total, label: "Backend" };
}

function activeSub(overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return {
    id: "sub-1",
    chatId: "chat-1",
    candidateId: null,
    params: { roleIds: ["r1"] },
    createdAt: new Date(),
    ...overrides,
  };
}

describe("DigestService", () => {
  const matchNew = jest.fn();
  const getActiveById = jest.fn();
  const pendingDelivery = jest.fn();
  const hasCompletedDelivery = jest.fn();
  const createDelivery = jest.fn();
  const record = jest.fn();
  const sendMessage = jest.fn();
  const digestEvaluated = jest.fn();
  const digestDeliveryFailed = jest.fn();
  let service: DigestService;

  beforeEach(async () => {
    matchNew.mockReset().mockResolvedValue(digestMatch([]));
    getActiveById.mockReset();
    pendingDelivery.mockReset().mockResolvedValue(null);
    hasCompletedDelivery.mockReset().mockResolvedValue(false);
    createDelivery.mockReset().mockImplementation(async (input) => ({
      ...input,
      sentVacancies: 0,
      sentPages: 0,
      status: "pending",
      createdAt: new Date(),
      completedAt: null,
    }));
    record.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset().mockResolvedValue(undefined);
    digestEvaluated.mockReset();
    digestDeliveryFailed.mockReset();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: ConfigService, useValue: { get: () => BASE } },
        { provide: SubscriptionMatcherService, useValue: { matchNew } },
        { provide: SubscriptionsService, useValue: { getActiveById } },
        {
          provide: SentNotificationsService,
          useValue: { pendingDelivery, hasCompletedDelivery, createDelivery, record },
        },
        { provide: TelegramService, useValue: { sendMessage } },
        {
          provide: AnalyticsService,
          useValue: { digestEvaluated, digestDeliveryFailed },
        },
      ],
    }).compile();
    service = moduleRef.get(DigestService);
  });

  describe("deliver", () => {
    it("returns 0 and sends nothing when the subscription is gone", async () => {
      getActiveById.mockResolvedValue(null);

      await expect(service.deliver("sub-1")).resolves.toBe(0);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("returns 0 and sends nothing when there are no new matches", async () => {
      getActiveById.mockResolvedValue(activeSub());
      matchNew.mockResolvedValue(digestMatch([], 0));

      await expect(service.deliver("sub-1", "evaluation-1")).resolves.toBe(0);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(digestEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: "sub-1",
          matches: 0,
          isFirstDigest: true,
          profileType: "feed",
          evaluationId: "digest_evaluated:evaluation-1",
        }),
      );
    });

    it("sends the page, then records its vacancies", async () => {
      getActiveById.mockResolvedValue(activeSub());
      matchNew.mockResolvedValue(digestMatch([createVacancy({ id: "v1" })], 1));

      await expect(service.deliver("sub-1")).resolves.toBe(1);

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith("chat-1", expect.any(String));
      expect(record).toHaveBeenCalledWith(
        "sub-1",
        ["v1"],
        expect.objectContaining({
          subscriptionId: "sub-1",
          vacancies: 1,
          pages: 1,
          id: "a096952d79fe2672783125e6a7b7ae2e7bfb8d029c939fd268f840a1a2aa4f94",
          isFirstDigest: true,
          profileType: "feed",
        }),
        true,
      );
      // Send must precede the record so a failed send is never marked sent.
      expect(sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
        record.mock.invocationCallOrder[0],
      );
    });

    it("splits a large match into multiple sent pages", async () => {
      getActiveById.mockResolvedValue(activeSub());
      const items = Array.from({ length: 11 }, (_, i) => createVacancy({ id: `v${i}` }));
      matchNew.mockResolvedValue(digestMatch(items, 11));

      await expect(service.deliver("sub-1")).resolves.toBe(11);
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledTimes(2);
    });

    it("completes against the capped delivery items when total matches are higher", async () => {
      getActiveById.mockResolvedValue(activeSub());
      const items = Array.from({ length: 50 }, (_, index) =>
        createVacancy({ id: `capped-${index}` }),
      );
      matchNew.mockResolvedValue(digestMatch(items, 100));

      await expect(service.deliver("sub-1")).resolves.toBe(50);

      expect(createDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ vacancies: 50, matchedVacancies: 100 }),
      );
      expect(record).toHaveBeenLastCalledWith(
        "sub-1",
        expect.any(Array),
        expect.objectContaining({ vacancies: 50, matchedVacancies: 100 }),
        true,
      );
    });

    it("marks a later CV digest as non-first", async () => {
      getActiveById.mockResolvedValue(activeSub({ candidateId: "candidate-1" }));
      hasCompletedDelivery.mockResolvedValue(true);
      matchNew.mockResolvedValue(digestMatch([createVacancy()], 1));

      await expect(service.deliver("sub-1")).resolves.toBe(1);

      expect(digestEvaluated).toHaveBeenCalledWith(
        expect.objectContaining({ isFirstDigest: false, profileType: "cv" }),
      );
      expect(record).toHaveBeenCalledWith(
        "sub-1",
        expect.any(Array),
        expect.objectContaining({ isFirstDigest: false, profileType: "cv" }),
        true,
      );
    });

    it("records a privacy-safe permanent delivery failure and rethrows it", async () => {
      getActiveById.mockResolvedValue(activeSub());
      matchNew.mockResolvedValue(digestMatch([createVacancy()], 1));
      const error = { error_code: 403 };
      sendMessage.mockRejectedValue(error);

      await expect(service.deliver("sub-1")).rejects.toBe(error);

      expect(record).not.toHaveBeenCalled();
      expect(digestDeliveryFailed).toHaveBeenCalledWith({
        subscriptionId: "sub-1",
        vacancies: 1,
        pages: 1,
        failedPage: 1,
        deliveryId: "a096952d79fe2672783125e6a7b7ae2e7bfb8d029c939fd268f840a1a2aa4f94",
        failureKind: "chat_unreachable",
        isFirstDigest: true,
        profileType: "feed",
      });
    });

    it("preserves the first-digest envelope after a partial multi-page failure", async () => {
      getActiveById.mockResolvedValue(activeSub());
      const items = Array.from({ length: 11 }, (_, index) => createVacancy({ id: `v${index}` }));
      matchNew.mockResolvedValue(digestMatch(items, items.length));
      const error = { error_code: 500 };
      sendMessage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(error);

      await expect(service.deliver("sub-1")).rejects.toBe(error);

      const original = await createDelivery.mock.results[0].value;
      const sentOnFirstPage = record.mock.calls[0][1].length;
      const resumed = {
        ...original,
        sentVacancies: sentOnFirstPage,
        sentPages: 1,
      };
      pendingDelivery.mockResolvedValue(resumed);
      matchNew.mockResolvedValue(
        digestMatch(items.slice(sentOnFirstPage), items.length - sentOnFirstPage),
      );
      sendMessage.mockReset().mockResolvedValue(undefined);
      record.mockClear();

      await expect(service.deliver("sub-1")).resolves.toBe(items.length - sentOnFirstPage);

      expect(hasCompletedDelivery).toHaveBeenCalledTimes(1);
      expect(createDelivery).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenLastCalledWith(
        "sub-1",
        expect.any(Array),
        expect.objectContaining({
          id: original.id,
          vacancies: 11,
          pages: 2,
          isFirstDigest: true,
        }),
        true,
      );
      expect(digestDeliveryFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: original.id,
          vacancies: 11,
          pages: 2,
          failedPage: 2,
          isFirstDigest: true,
        }),
      );
    });
  });
});
