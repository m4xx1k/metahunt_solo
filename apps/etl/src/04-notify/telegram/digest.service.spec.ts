import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import type { FeedResponse, VacancyDto } from "../../03-discovery/feed/feed.contract";
import { FeedService } from "../../03-discovery/feed/feed.service";
import { DigestService } from "./digest.service";
import { SentNotificationsService } from "./sent-notifications.service";
import {
  SubscriptionsService,
  type ActiveSubscription,
} from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

const BASE = "https://api.metahunt.io";
const DAY_MS = 86_400_000;
const SCAN_WINDOW_DAYS = 14;

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
    ...overrides,
  };
}

function feedResponse(items: VacancyDto[], total = items.length): FeedResponse {
  return { items, page: 1, pageSize: 50, total };
}

function activeSub(overrides: Partial<ActiveSubscription> = {}): ActiveSubscription {
  return {
    id: "sub-1",
    chatId: "chat-1",
    params: { roleIds: ["r1"] },
    createdAt: new Date(Date.now() - DAY_MS), // within the window by default
    ...overrides,
  };
}

describe("DigestService", () => {
  const search = jest.fn();
  const getActiveById = jest.fn();
  const describe_ = jest.fn();
  const sentVacancyIds = jest.fn();
  const record = jest.fn();
  const sendMessage = jest.fn();
  let service: DigestService;

  beforeEach(async () => {
    search.mockReset().mockResolvedValue(feedResponse([]));
    getActiveById.mockReset();
    describe_.mockReset().mockResolvedValue("Backend");
    sentVacancyIds.mockReset().mockResolvedValue([]);
    record.mockReset().mockResolvedValue(undefined);
    sendMessage.mockReset().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: ConfigService, useValue: { get: () => BASE } },
        { provide: FeedService, useValue: { search } },
        {
          provide: SubscriptionsService,
          useValue: { getActiveById, describe: describe_ },
        },
        { provide: SentNotificationsService, useValue: { sentVacancyIds, record } },
        { provide: TelegramService, useValue: { sendMessage } },
      ],
    }).compile();
    service = moduleRef.get(DigestService);
  });

  describe("matchNew", () => {
    it("scans from the subscription's createdAt when it's within the window", async () => {
      const sub = activeSub();
      await service.matchNew(sub);

      expect(sentVacancyIds).toHaveBeenCalledWith(sub.id, sub.createdAt);
      const arg = search.mock.calls[0][0];
      expect(arg.loadedAfter).toBe(sub.createdAt);
    });

    it("floors the scan at the window when the subscription is older", async () => {
      const sub = activeSub({ createdAt: new Date(Date.now() - 100 * DAY_MS) });
      await service.matchNew(sub);

      const arg = search.mock.calls[0][0];
      const expected = Date.now() - SCAN_WINDOW_DAYS * DAY_MS;
      expect(Math.abs(arg.loadedAfter.getTime() - expected)).toBeLessThan(5000);
    });

    it("passes the already-sent ids as the anti-join exclusion", async () => {
      sentVacancyIds.mockResolvedValue(["a", "b"]);
      await service.matchNew(activeSub());

      expect(search.mock.calls[0][0].excludeIds).toEqual(["a", "b"]);
    });
  });

  describe("deliver", () => {
    it("returns 0 and sends nothing when the subscription is gone", async () => {
      getActiveById.mockResolvedValue(null);

      await expect(service.deliver("sub-1")).resolves.toBe(0);
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("returns 0 and sends nothing when there are no new matches", async () => {
      getActiveById.mockResolvedValue(activeSub());
      search.mockResolvedValue(feedResponse([], 0));

      await expect(service.deliver("sub-1")).resolves.toBe(0);
      expect(sendMessage).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it("sends the page, then records its vacancies", async () => {
      getActiveById.mockResolvedValue(activeSub());
      search.mockResolvedValue(feedResponse([createVacancy({ id: "v1" })], 1));

      await expect(service.deliver("sub-1")).resolves.toBe(1);

      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith("chat-1", expect.any(String));
      expect(record).toHaveBeenCalledWith("sub-1", ["v1"]);
      // Send must precede the record so a failed send is never marked sent.
      expect(sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
        record.mock.invocationCallOrder[0],
      );
    });

    it("splits a large match into multiple sent pages", async () => {
      getActiveById.mockResolvedValue(activeSub());
      const items = Array.from({ length: 11 }, (_, i) =>
        createVacancy({ id: `v${i}` }),
      );
      search.mockResolvedValue(feedResponse(items, 11));

      await expect(service.deliver("sub-1")).resolves.toBe(11);
      expect(sendMessage).toHaveBeenCalledTimes(2);
      expect(record).toHaveBeenCalledTimes(2);
    });
  });
});
