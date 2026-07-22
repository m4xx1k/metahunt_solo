import { randomUUID } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { ProductAnalyticsService } from "../../src/admin/product-analytics/product-analytics.service";
import {
  PRODUCT_FUNNEL_STEPS,
  type ProductFunnelStep,
} from "../../src/admin/product-analytics/product-analytics.contract";
import { SubscriptionsService } from "../../src/04-notify/telegram/subscriptions.service";
import type { AnalyticsSink } from "../../src/platform/analytics/analytics.ports";
import { AnalyticsOutboxStore } from "../../src/platform/analytics/analytics-outbox.store";
import { AnalyticsService } from "../../src/platform/analytics/analytics.service";
import { ANALYTICS_EVENTS } from "../../src/platform/analytics/events";
import { ProductEventStore } from "../../src/platform/analytics/product-event.store";
import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";

import { makeTestDb } from "./db";

const { analyticsJourneys, authIdentities, productEvents, subscriptions, users } = schema;

let db: DrizzleDB;
let pool: Pool;

interface SeedFunnelJourneyOptions {
  isTest?: boolean;
  cohortId?: string;
  createdAt?: Date;
  events: Array<{ name: ProductFunnelStep; occurredAt: Date }>;
}

async function seedFunnelJourney(options: SeedFunnelJourneyOptions): Promise<string> {
  const journeyId = randomUUID();
  await db.insert(analyticsJourneys).values({
    id: journeyId,
    origin: "browser",
    isTest: options.isTest ?? false,
    cohortId: options.cohortId,
    createdAt: options.createdAt,
  });
  if (options.events.length > 0) {
    await db.insert(productEvents).values(
      options.events.map((event) => ({
        journeyId,
        name: event.name,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: event.occurredAt,
      })),
    );
  }
  return journeyId;
}

function orderedEvents(start: Date, offsetDays = 0) {
  return PRODUCT_FUNNEL_STEPS.map((name, index) => ({
    name,
    occurredAt: new Date(start.getTime() + offsetDays * 86_400_000 + index * 60_000),
  }));
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

describe("first-party product analytics ledger", () => {
  it("keeps browser, API, Telegram, and worker events on one journey", async () => {
    const capture = jest.fn();
    const sink: AnalyticsSink = { capture };
    const outbox = new AnalyticsOutboxStore(db);
    const analytics = new AnalyticsService(new ProductEventStore(db), outbox, sink);
    const subscriptionsService = new SubscriptionsService(db, analytics, new NodeSlugResolver(db));
    const dashboard = new ProductAnalyticsService(db);
    const journeyId = randomUUID();
    const browserEventId = randomUUID();
    const [user] = await db.insert(users).values({ source: "test" }).returning({ id: users.id });
    await db.insert(authIdentities).values({
      userId: user.id,
      provider: "telegram",
      providerUserId: "fixture-chat",
    });

    await analytics.browserEvent({
      journeyId,
      eventId: browserEventId,
      name: ANALYTICS_EVENTS.landingView,
      occurredAt: new Date(),
      properties: { landing_variant: "backend-radar" },
    });
    await analytics.browserEvent({
      journeyId,
      eventId: browserEventId,
      name: ANALYTICS_EVENTS.landingView,
      occurredAt: new Date(),
      properties: { landing_variant: "backend-radar" },
    });

    const subscriptionId = await subscriptionsService.create(
      { seniority: "MIDDLE" },
      { journeyId },
    );
    await expect(subscriptionsService.linkChat(subscriptionId, "fixture-chat")).resolves.toBe(
      "linked",
    );
    await analytics.activationValueShown(subscriptionId, 3, 3);
    await analytics.digestEvaluated({
      subscriptionId,
      matches: 3,
      isFirstDigest: true,
      profileType: "feed",
      evaluationId: `digest_evaluated:${randomUUID()}`,
    });
    await analytics.digestSent({
      subscriptionId,
      vacancies: 3,
      pages: 1,
      deliveryId: `digest_sent:${randomUUID()}`,
      isFirstDigest: true,
      profileType: "feed",
    });
    await outbox.drain(100);

    const [journey] = await db
      .select()
      .from(analyticsJourneys)
      .where(eq(analyticsJourneys.id, journeyId));
    const [subscription] = await db
      .select({ journeyId: subscriptions.journeyId, userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    const events = await db
      .select({ name: productEvents.name, journeyId: productEvents.journeyId })
      .from(productEvents)
      .orderBy(asc(productEvents.occurredAt));
    const overview = await dashboard.overview("all");

    expect(journey.origin).toBe("browser");
    expect(subscription.journeyId).toBe(journeyId);
    expect(subscription.userId).toBe(user.id);
    expect(events).toHaveLength(6);
    expect(new Set(events.map((event) => event.journeyId))).toEqual(new Set([journeyId]));
    expect(events.map((event) => event.name)).toEqual(
      expect.arrayContaining([
        ANALYTICS_EVENTS.landingView,
        ANALYTICS_EVENTS.subscriptionCreated,
        ANALYTICS_EVENTS.telegramLinked,
        ANALYTICS_EVENTS.activationValueShown,
        ANALYTICS_EVENTS.digestEvaluated,
        ANALYTICS_EVENTS.digestSent,
      ]),
    );
    expect(overview.identity.subscriptionsWithoutJourney).toBe(0);
    expect(overview.identity.trackedLinkedWithoutEvent).toBe(0);
    expect(overview.identity.trackedDeliveryWithoutEvent).toBe(0);
    expect(overview.identity.accountLinkedJourneys).toBe(1);
    expect(overview.recentJourneys[0]?.id).toBe(journeyId);
  });

  it("counts each step independently for the selected journey cohort", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const start = new Date(Date.now() - 60 * 60 * 1000);

    await seedFunnelJourney({ events: orderedEvents(start) });
    await seedFunnelJourney({
      events: [
        { name: PRODUCT_FUNNEL_STEPS[0], occurredAt: start },
        { name: PRODUCT_FUNNEL_STEPS[1], occurredAt: new Date(start.getTime() + 2 * 60_000) },
        { name: PRODUCT_FUNNEL_STEPS[2], occurredAt: new Date(start.getTime() + 60_000) },
        ...PRODUCT_FUNNEL_STEPS.slice(3).map((name, index) => ({
          name,
          occurredAt: new Date(start.getTime() + (index + 3) * 60_000),
        })),
      ],
    });
    await seedFunnelJourney({
      events: [
        { name: PRODUCT_FUNNEL_STEPS[0], occurredAt: start },
        { name: PRODUCT_FUNNEL_STEPS[1], occurredAt: new Date(start.getTime() + 60_000) },
        ...PRODUCT_FUNNEL_STEPS.slice(3).map((name, index) => ({
          name,
          occurredAt: new Date(start.getTime() + (index + 2) * 60_000),
        })),
      ],
    });
    await seedFunnelJourney({
      events: [
        { name: PRODUCT_FUNNEL_STEPS[0], occurredAt: start },
        ...PRODUCT_FUNNEL_STEPS.slice(1).map((name, index) => ({
          name,
          occurredAt: new Date(start.getTime() + 8 * 86_400_000 + index * 60_000),
        })),
      ],
    });
    await seedFunnelJourney({
      isTest: true,
      cohortId: "controlled-a",
      events: orderedEvents(start),
    });
    await seedFunnelJourney({
      createdAt: new Date(Date.now() - 40 * 86_400_000),
      events: orderedEvents(start),
    });

    const productionWeek = await dashboard.overview("week");
    const productionAll = await dashboard.overview("all");
    const tests = await dashboard.overview("week", "test");
    const everyone = await dashboard.overview("week", "all");

    expect(productionWeek.population).toBe("production");
    expect(productionWeek.funnel.map((step) => step.journeys)).toEqual([4, 4, 3, 4, 4, 4, 4, 4, 4]);
    expect(productionAll.funnel.map((step) => step.journeys)).toEqual([5, 5, 4, 5, 5, 5, 5, 5, 5]);
    expect(tests.funnel.map((step) => step.journeys)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(everyone.funnel.map((step) => step.journeys)).toEqual([5, 5, 4, 5, 5, 5, 5, 5, 5]);
    expect(productionWeek.recentJourneys.every((journey) => !journey.isTest)).toBe(true);
    expect(tests.recentJourneys).toEqual([
      expect.objectContaining({ isTest: true, cohortId: "controlled-a" }),
    ]);
  });

  it("still counts steps a journey completed even without a landing_view event", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const start = new Date();
    await seedFunnelJourney({
      events: [
        { name: PRODUCT_FUNNEL_STEPS[1], occurredAt: start },
        { name: PRODUCT_FUNNEL_STEPS[8], occurredAt: new Date(start.getTime() + 60_000) },
      ],
    });

    const overview = await dashboard.overview("all");

    expect(overview.funnel[0].journeys).toBe(0);
    expect(overview.funnel[1].journeys).toBe(1);
    expect(overview.funnel[8].journeys).toBe(1);
  });

  it("reclassifies a journey into the controlled-test population", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const journeyId = await seedFunnelJourney({ events: orderedEvents(new Date()) });

    await expect(
      dashboard.updateJourney(journeyId, { isTest: true, cohortId: "  controlled-b  " }),
    ).resolves.toEqual({
      id: journeyId,
      isTest: true,
      cohortId: "controlled-b",
    });

    const production = await dashboard.overview("all");
    const tests = await dashboard.overview("all", "test");
    expect(production.funnel[0].journeys).toBe(0);
    expect(tests.funnel[0].journeys).toBe(1);
    expect(tests.recentJourneys[0]).toEqual(
      expect.objectContaining({ id: journeyId, isTest: true, cohortId: "controlled-b" }),
    );
  });

  it("attributes feed clicks to a subscriber only when their journey has exactly one subscription", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const soloJourneyId = randomUUID();
    const sharedJourneyId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: soloJourneyId, origin: "browser" },
      { id: sharedJourneyId, origin: "browser" },
    ]);
    const [soloSub] = await db
      .insert(subscriptions)
      .values({ chatId: "chat-solo", journeyId: soloJourneyId, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    await db.insert(subscriptions).values([
      { chatId: "chat-shared-a", journeyId: sharedJourneyId, params: {}, isActive: true },
      { chatId: "chat-shared-b", journeyId: sharedJourneyId, params: {}, isActive: true },
    ]);

    await db.insert(productEvents).values([
      // Solo journey: 2 feed clicks (journey-scoped) + 1 digest click (subscription-scoped).
      {
        journeyId: soloJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
      },
      {
        journeyId: soloJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
      },
      {
        journeyId: soloJourneyId,
        subscriptionId: soloSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
      },
      // Shared journey (1:many): 3 feed clicks that must NOT land on either subscriber.
      {
        journeyId: sharedJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
      },
      {
        journeyId: sharedJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
      },
      {
        journeyId: sharedJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
      },
    ]);

    const overview = await dashboard.overview("all");
    const bySubscriber = new Map(overview.subscriberActivity.map((row) => [row.chatId, row]));

    expect(bySubscriber.get("chat-solo")).toEqual(
      expect.objectContaining({ feedClicks: 2, vacancyClicks: 1 }),
    );
    expect(bySubscriber.get("chat-shared-a")).toEqual(
      expect.objectContaining({ feedClicks: 0, vacancyClicks: 0 }),
    );
    expect(bySubscriber.get("chat-shared-b")).toEqual(
      expect.objectContaining({ feedClicks: 0, vacancyClicks: 0 }),
    );
    // feedEngagement counts every journey with a feed click regardless of
    // subscription count — it's a distinct-journeys KPI, not per-subscriber.
    expect(overview.feedEngagement).toEqual({ journeys: 2, events: 5 });
  });
});
