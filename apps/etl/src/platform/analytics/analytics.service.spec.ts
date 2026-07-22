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

  it("records immediate activation value without user identifiers", () => {
    const service = makeService();

    service.activationValueShown("subscription-1", 7, 3);

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.activationValueShown,
      properties: {
        matches: 7,
        shown: 3,
        result: "matches",
        $insert_id: "activation_value_shown:subscription-1",
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
      isFirstDigest: true,
      profileType: "feed",
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.digestSent,
      properties: {
        vacancies: 3,
        pages: 1,
        is_first_digest: true,
        profile_type: "feed",
        $insert_id: "delivery-hash",
      },
    });
  });

  it("records a zero-match evaluation as an observable first-value outcome", () => {
    const service = makeService();

    service.digestEvaluated({
      subscriptionId: "subscription-1",
      matches: 0,
      isFirstDigest: true,
      profileType: "feed",
      evaluationId: "evaluation-1",
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.digestEvaluated,
      properties: {
        matches: 0,
        result: "empty",
        is_first_digest: true,
        profile_type: "feed",
        $insert_id: "evaluation-1",
      },
    });
  });

  it("classifies delivery failure without sending an error message or chat identity", () => {
    const service = makeService();

    service.digestDeliveryFailed({
      subscriptionId: "subscription-1",
      vacancies: 3,
      pages: 2,
      failedPage: 2,
      deliveryId: "delivery-hash",
      failureKind: "transient",
      isFirstDigest: false,
      profileType: "cv",
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: "subscription-1",
      event: ANALYTICS_EVENTS.digestDeliveryFailed,
      properties: {
        vacancies: 3,
        pages: 2,
        failed_page: 2,
        failure_kind: "transient",
        is_first_digest: false,
        profile_type: "cv",
        $insert_id: "digest_delivery_failed:delivery-hash:2",
      },
    });
  });
});
