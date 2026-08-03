const mockCapture = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({ capture: mockCapture, shutdown: mockShutdown })),
}));

import { ConfigService } from "@nestjs/config";

import { PRODUCT_ANALYTICS_EVENTS, ProductAnalyticsService } from "./product-analytics.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("ProductAnalyticsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends only the frozen account event with allowlisted properties", () => {
    const service = new ProductAnalyticsService(
      new ConfigService({
        POSTHOG_API_KEY: "phc_test",
        ANALYTICS_TEST_TRAFFIC: "true",
      }),
    );

    service.accountCreated(USER_ID, "telegram");

    expect(PRODUCT_ANALYTICS_EVENTS).toEqual([
      "$pageview",
      "account_created",
      "signed_in",
      "subscription_created",
      "digest_sent",
      "vacancy_outbound_clicked",
      "subscription_deactivated",
    ]);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: USER_ID,
      event: "account_created",
      properties: { provider: "telegram", is_test: true },
    });
  });

  it("uses users.id only and never captures an invalid actor", () => {
    const service = new ProductAnalyticsService(new ConfigService({ POSTHOG_API_KEY: "phc_test" }));

    service.vacancyOutboundClicked("telegram-chat-id", "telegram_digest");

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("is dormant without the product ingestion key", () => {
    const service = new ProductAnalyticsService(new ConfigService());

    service.signedIn(USER_ID, "google");

    expect(mockCapture).not.toHaveBeenCalled();
  });
});
