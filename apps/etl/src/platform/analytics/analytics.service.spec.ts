import type {
  AnalyticsOutboxWriter,
  AnalyticsSink,
  ProductEventWrite,
  ProductEventWriter,
  SubscriberIdentity,
} from "./analytics.ports";
import { AnalyticsService } from "./analytics.service";
import type { OutboundSurface } from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";
import type { ProductAnalyticsService } from "./product-analytics.service";

describe("AnalyticsService", () => {
  const record = jest.fn<Promise<void>, [ProductEventWrite]>();
  const enqueue = jest.fn<Promise<void>, [ProductEventWrite]>();
  const drain = jest.fn<Promise<ProductEventWrite[]>, [number]>();
  const journeyForSubscription = jest.fn<Promise<string | null>, [string]>();
  const personForJourney = jest.fn<Promise<string | null>, [string]>();
  const subscriberForSubscription = jest.fn<Promise<SubscriberIdentity | null>, [string]>();
  const subscriberForJourney = jest.fn<Promise<SubscriberIdentity | null>, [string]>();
  const capture = jest.fn<void, [string, string, Record<string, unknown>]>();
  const alias = jest.fn<void, [string, string]>();
  const vacancyOutboundClicked = jest.fn<void, [string, OutboundSurface]>();

  function makeService(): AnalyticsService {
    const events: ProductEventWriter = {
      record,
      journeyForSubscription,
      personForJourney,
      subscriberForSubscription,
      subscriberForJourney,
    };
    const outbox: AnalyticsOutboxWriter = { enqueue, drain };
    const sink: AnalyticsSink = { capture, alias };
    const productAnalytics = { vacancyOutboundClicked } as unknown as ProductAnalyticsService;
    return new AnalyticsService(events, outbox, sink, productAnalytics);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    record.mockResolvedValue();
    enqueue.mockResolvedValue();
    journeyForSubscription.mockResolvedValue("journey-1");
    personForJourney.mockResolvedValue("person-1");
    subscriberForSubscription.mockResolvedValue(null);
    subscriberForJourney.mockResolvedValue(null);
  });

  it("summarizes subscription filters without sending their values", async () => {
    const service = makeService();

    await service.subscriptionCreated("subscription-1", "journey-1", {
      roleIds: ["role-1"],
      q: "sensitive search",
    });

    expect(enqueue).toHaveBeenCalledWith({
      journeyId: "journey-1",
      subscriptionId: "subscription-1",
      name: ANALYTICS_EVENTS.subscriptionCreated,
      source: "api",
      dedupeKey: "subscription_created:subscription-1",
      properties: {
        filterCount: 2,
        $insert_id: "subscription_created:subscription-1",
      },
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("resolves Telegram events back to the subscription journey", async () => {
    const service = makeService();

    await service.telegramLinked("subscription-1", "linked");

    expect(journeyForSubscription).toHaveBeenCalledWith("subscription-1");
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: "journey-1",
        name: ANALYTICS_EVENTS.telegramLinked,
      }),
    );
  });

  it("records immediate activation value without user identifiers", async () => {
    const service = makeService();

    await service.activationValueShown("subscription-1", 7, 3);

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: ANALYTICS_EVENTS.activationValueShown }),
    );
  });

  it("uses deterministic delivery identity", async () => {
    const service = makeService();

    await service.digestSent({
      subscriptionId: "subscription-1",
      vacancies: 3,
      pages: 1,
      deliveryId: "delivery-hash",
      isFirstDigest: true,
      profileType: "feed",
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.digestSent,
        dedupeKey: "delivery-hash",
      }),
    );
  });

  it("records zero-match evaluation as an observable outcome", async () => {
    const service = makeService();

    await service.digestEvaluated({
      subscriptionId: "subscription-1",
      matches: 0,
      isFirstDigest: true,
      profileType: "feed",
      evaluationId: "evaluation-1",
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.digestEvaluated,
        dedupeKey: "evaluation-1",
      }),
    );
  });

  it("contains an outbox persistence failure", async () => {
    const service = makeService();
    enqueue.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.telegramLinked("subscription-1", "linked")).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not fail a domain flow when journey resolution fails", async () => {
    const service = makeService();
    journeyForSubscription.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.telegramLinked("subscription-1", "linked")).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });

  it("attributes an apply click to the subscription when one is present, even with a journey", async () => {
    const service = makeService();

    await service.applyClicked("vacancy-1", "subscription-1", "journey-2");

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.digestLinkClicked,
        journeyId: "journey-1",
        properties: expect.objectContaining({
          vacancy_id: "vacancy-1",
          surface: "telegram_digest",
        }),
      }),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it("records a durable journey-level apply click when there is no subscription", async () => {
    const service = makeService();

    await service.applyClicked("vacancy-1", undefined, "journey-2");

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: "journey-2",
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser",
        properties: expect.objectContaining({ vacancy_id: "vacancy-1", surface: "web_feed" }),
      }),
    );
    expect(capture).toHaveBeenCalledWith(
      "person-1",
      ANALYTICS_EVENTS.vacancyOutboundClicked,
      expect.objectContaining({ vacancy_id: "vacancy-1", surface: "web_feed" }),
    );
  });

  it("falls back to an anonymous apply click when neither subscription nor journey is present", async () => {
    const service = makeService();

    await service.applyClicked("vacancy-1");

    expect(record).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith(
      expect.any(String),
      ANALYTICS_EVENTS.vacancyOutboundClicked,
      expect.objectContaining({
        vacancy_id: "vacancy-1",
        surface: "web_feed",
        $process_person_profile: false,
      }),
    );
  });

  it("attributes a digest tap to the subscription's person", async () => {
    const service = makeService();
    subscriberForSubscription.mockResolvedValue({
      personId: "33333333-3333-4333-8333-333333333333",
      subscriptionKind: "feed",
    });

    await service.applyClicked("vacancy-1", "subscription-1");

    expect(vacancyOutboundClicked).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      "telegram_digest",
    );
  });

  it("emits nothing for a digest tap on a subscription that no longer exists", async () => {
    const service = makeService();

    await service.applyClicked("vacancy-1", "subscription-1");

    expect(enqueue).toHaveBeenCalled();
    expect(vacancyOutboundClicked).not.toHaveBeenCalled();
  });

  it("attributes a feed tap when the journey resolves to a single subscriber", async () => {
    const service = makeService();
    subscriberForJourney.mockResolvedValue({
      personId: "44444444-4444-4444-8444-444444444444",
      subscriptionKind: "cv",
    });

    await service.applyClicked("vacancy-1", undefined, "journey-2");

    expect(subscriberForJourney).toHaveBeenCalledWith("journey-2");
    expect(vacancyOutboundClicked).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "web_feed",
    );
  });

  it("keeps the outbound click alive when the identity lookup fails", async () => {
    const service = makeService();
    subscriberForSubscription.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.applyClicked("vacancy-1", "subscription-1")).resolves.toBeUndefined();
    expect(vacancyOutboundClicked).not.toHaveBeenCalled();
  });

  it("keeps the redirect's fire-and-forget call safe when the journey ledger write fails", async () => {
    const service = makeService();
    record.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      service.applyClicked("vacancy-1", undefined, "journey-2"),
    ).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });
});
