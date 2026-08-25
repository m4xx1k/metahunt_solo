import { AnalyticsService } from "./analytics.service";
import type { SubscriberIdentity, SubscriberIdentityReader } from "./analytics.ports";
import type { PostHogClient } from "./posthog.client";

const VACANCY = { vacancyId: "vac-1", source: "dou", company: "Acme" };

function makeService(identity: Partial<SubscriberIdentityReader> = {}) {
  const posthog = {
    capture: jest.fn(),
    vacancyOutboundClicked: jest.fn(),
    mergePerson: jest.fn(),
  };
  const reader: SubscriberIdentityReader = {
    subscriberForSubscription: jest.fn(async () => null),
    subscriberForJourney: jest.fn(async () => null),
    ...identity,
  };
  return {
    posthog,
    reader,
    service: new AnalyticsService(reader, posthog as unknown as PostHogClient),
  };
}

const subscriber: SubscriberIdentity = { personId: "person-1", subscriptionKind: "feed" };

describe("outbound clicks", () => {
  it("attributes a digest tap to the subscription's person", async () => {
    const { service, posthog } = makeService({
      subscriberForSubscription: jest.fn(async () => subscriber),
    });

    await service.applyClicked(VACANCY, "sub-1");

    expect(posthog.vacancyOutboundClicked).toHaveBeenCalledWith(
      "person-1",
      "telegram_digest",
      VACANCY,
    );
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("attributes a feed tap to the subscriber when the journey names exactly one", async () => {
    const { service, posthog } = makeService({
      subscriberForJourney: jest.fn(async () => subscriber),
    });

    await service.applyClicked(VACANCY, undefined, "journey-1");

    expect(posthog.vacancyOutboundClicked).toHaveBeenCalledWith("person-1", "web_feed", VACANCY);
  });

  // The journey id IS the person id for a browser visit that has not subscribed
  // yet; an account claim merges the two by alias, so capturing on it is not a
  // synthetic identity.
  it("falls back to the journey id when the journey names nobody", async () => {
    const { service, posthog } = makeService();

    await service.applyClicked(VACANCY, undefined, "journey-1");

    expect(posthog.vacancyOutboundClicked).toHaveBeenCalledWith("journey-1", "web_feed", VACANCY);
  });

  // Neither `?s=` nor `?j=`: real volume, unusable id. Its own verb keeps the
  // attributed one clean without anyone having to remember a filter.
  it("gives an unnameable tap its own personless verb", async () => {
    const { service, posthog } = makeService();

    await service.applyClicked(VACANCY);

    expect(posthog.vacancyOutboundClicked).not.toHaveBeenCalled();
    expect(posthog.capture).toHaveBeenCalledWith(
      expect.any(String),
      "vacancy_outbound_unattributed",
      expect.objectContaining({ is_anonymous: true, $process_person_profile: false }),
    );
    const [, , properties] = posthog.capture.mock.calls[0];
    expect(properties).not.toHaveProperty("surface");
  });

  it("never lets an identity lookup failure reach the redirect", async () => {
    const { service, posthog } = makeService({
      subscriberForSubscription: jest.fn(async () => {
        throw new Error("db down");
      }),
    });

    await expect(service.applyClicked(VACANCY, "sub-1")).resolves.toBeUndefined();
    expect(posthog.vacancyOutboundClicked).not.toHaveBeenCalled();
  });
});

describe("identity merges", () => {
  it("merges a browser journey into the subscriber's person", () => {
    const { service, posthog } = makeService();

    service.aliasJourneyToPerson("journey-1", "person-1");

    expect(posthog.mergePerson).toHaveBeenCalledWith("person-1", "journey-1");
  });

  it("merges a claimed person into the account's person", () => {
    const { service, posthog } = makeService();

    service.aliasPerson("old-person", "account-person");

    expect(posthog.mergePerson).toHaveBeenCalledWith("account-person", "old-person");
  });
});
