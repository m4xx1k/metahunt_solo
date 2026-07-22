import type {
  AnalyticsOutboxWriter,
  AnalyticsSink,
  ProductEventWrite,
  ProductEventWriter,
} from "./analytics.ports";
import { AnalyticsService } from "./analytics.service";
import { ANALYTICS_EVENTS } from "./events";

describe("AnalyticsService", () => {
  const record = jest.fn<Promise<void>, [ProductEventWrite]>();
  const enqueue = jest.fn<Promise<void>, [ProductEventWrite]>();
  const drain = jest.fn<Promise<ProductEventWrite[]>, [number]>();
  const journeyForSubscription = jest.fn<Promise<string | null>, [string]>();
  const capture = jest.fn<void, [string, string, Record<string, unknown>]>();

  function makeService(): AnalyticsService {
    const events: ProductEventWriter = { record, journeyForSubscription };
    const outbox: AnalyticsOutboxWriter = { enqueue, drain };
    const sink: AnalyticsSink = { capture };
    return new AnalyticsService(events, outbox, sink);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    record.mockResolvedValue();
    enqueue.mockResolvedValue();
    journeyForSubscription.mockResolvedValue("journey-1");
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

  it("rejects a browser event when the durable ledger write fails", async () => {
    const service = makeService();
    record.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      service.browserEvent({
        journeyId: "11111111-1111-1111-1111-111111111111",
        eventId: "22222222-2222-2222-2222-222222222222",
        name: ANALYTICS_EVENTS.landingView,
        occurredAt: new Date(),
        properties: {},
      }),
    ).rejects.toThrow("database unavailable");
    expect(capture).not.toHaveBeenCalled();
  });

  it("does not fail a domain flow when journey resolution fails", async () => {
    const service = makeService();
    journeyForSubscription.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.telegramLinked("subscription-1", "linked")).resolves.toBeUndefined();
    expect(capture).not.toHaveBeenCalled();
  });
});
