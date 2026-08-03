const mockCapture = jest.fn();
const mockShutdown = jest.fn();

jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({ capture: mockCapture, shutdown: mockShutdown })),
}));

import { ConfigService } from "@nestjs/config";

import { ANALYTICS_V2_EVENTS, AnalyticsV2Service } from "./analytics-v2.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("AnalyticsV2Service", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends only the frozen account event with allowlisted properties", () => {
    const service = new AnalyticsV2Service(
      new ConfigService({
        ANALYTICS_V2: "true",
        POSTHOG_V2_API_KEY: "phc_v2",
        ANALYTICS_TEST_TRAFFIC: "true",
      }),
    );

    service.accountCreated(USER_ID, "telegram");

    expect(ANALYTICS_V2_EVENTS).toEqual([
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
    const service = new AnalyticsV2Service(
      new ConfigService({ ANALYTICS_V2: "true", POSTHOG_V2_API_KEY: "phc_v2" }),
    );

    service.vacancyOutboundClicked("telegram-chat-id", "telegram_digest");

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("is dormant unless v2 is explicitly enabled", () => {
    const service = new AnalyticsV2Service(new ConfigService({ POSTHOG_V2_API_KEY: "phc_v2" }));

    service.signedIn(USER_ID, "google");

    expect(mockCapture).not.toHaveBeenCalled();
  });
});
