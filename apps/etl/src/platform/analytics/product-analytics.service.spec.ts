const mockCapture = jest.fn();
const mockAlias = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest
    .fn()
    .mockImplementation(() => ({ capture: mockCapture, alias: mockAlias, shutdown: mockShutdown })),
}));

import { ConfigService } from "@nestjs/config";

import { PRODUCT_ANALYTICS_EVENTS, ProductAnalyticsService } from "./product-analytics.service";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const TELEGRAM_PERSON_ID = "22222222-2222-4222-8222-222222222222";

describe("ProductAnalyticsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends only the frozen account event with allowlisted properties", () => {
    const service = new ProductAnalyticsService(
      new ConfigService({
        POSTHOG_API_KEY: "phc_test",
        ANALYTICS_TEST_TRAFFIC: "true",
      }),
    );

    service.accountCreated(PERSON_ID, "telegram");

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
      distinctId: PERSON_ID,
      event: "account_created",
      properties: { provider: "telegram", is_test: true, $set: { has_account: true } },
    });
  });

  it("captures a subscriber who has no account and gives them a profile", () => {
    const service = new ProductAnalyticsService(new ConfigService({ POSTHOG_API_KEY: "phc_test" }));

    service.digestSent(TELEGRAM_PERSON_ID, "feed");

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: TELEGRAM_PERSON_ID,
      event: "digest_sent",
      properties: {
        subscription_kind: "feed",
        is_test: false,
        $set: { subscription_kind: "feed", is_subscriber: true },
      },
    });
  });

  it("merges the pre-account person into the account on claim", () => {
    const service = new ProductAnalyticsService(new ConfigService({ POSTHOG_API_KEY: "phc_test" }));

    service.mergePerson(PERSON_ID, TELEGRAM_PERSON_ID);

    expect(mockAlias).toHaveBeenCalledWith({ distinctId: PERSON_ID, alias: TELEGRAM_PERSON_ID });
  });

  it("does not merge a person into itself", () => {
    const service = new ProductAnalyticsService(new ConfigService({ POSTHOG_API_KEY: "phc_test" }));

    service.mergePerson(PERSON_ID, PERSON_ID);

    expect(mockAlias).not.toHaveBeenCalled();
  });

  it("is dormant without the product ingestion key", () => {
    const service = new ProductAnalyticsService(new ConfigService());

    service.signedIn(PERSON_ID, "google");

    expect(mockCapture).not.toHaveBeenCalled();
  });
});
