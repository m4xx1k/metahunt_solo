const mockCapture = jest.fn();
const mockAlias = jest.fn();
const mockIdentify = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    alias: mockAlias,
    identify: mockIdentify,
    shutdown: mockShutdown,
  })),
}));

import { AnalyticsService } from "./analytics.service";
import { ANALYTICS_EVENTS } from "./events";

describe("AnalyticsService", () => {
  function makeService() {
    return new AnalyticsService({
      get: (key: string) => (key === "POSTHOG_API_KEY" ? "test-key" : undefined),
    } as never);
  }

  beforeEach(() => {
    mockCapture.mockReset();
    mockAlias.mockReset();
    mockIdentify.mockReset();
    mockShutdown.mockReset();
  });

  it("summarizes subscription filters without sending their values", () => {
    const service = makeService();

    service.subscriptionCreated("subscription-1", {
      roleIds: ["role-1"],
      q: "sensitive search",
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.subscriptionCreated,
      properties: {
        filterCount: 2,
        $insert_id: "subscription_created:subscription-1",
      },
    });
  });

  it("records Telegram linkage without creating a chat identity", () => {
    const service = makeService();

    service.telegramLinked("subscription-1", "linked");

    expect(mockAlias).not.toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.telegramLinked,
      properties: {
        result: "linked",
        $insert_id: "telegram_linked:subscription-1:linked",
      },
    });
  });

  it("uses the subscription as the digest identity and a deterministic delivery id", () => {
    const service = makeService();

    service.digestSent({
      subscriptionId: "subscription-1",
      vacancies: 3,
      pages: 1,
      deliveryId: "delivery-hash",
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.digestSent,
      properties: {
        vacancies: 3,
        pages: 1,
        $insert_id: "delivery-hash",
      },
    });
  });
});
