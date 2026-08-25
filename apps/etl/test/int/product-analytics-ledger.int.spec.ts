import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { ProductAnalyticsService } from "../../src/admin/product-analytics/product-analytics.service";
import {
  PRODUCT_FUNNEL_STEPS,
  type ProductFunnelStep,
} from "../../src/admin/product-analytics/product-analytics.contract";
import { ANALYTICS_EVENTS } from "../../src/platform/analytics/events";

import { makeTestDb } from "./db";

const { analyticsJourneys, productEvents, subscriptions } = schema;

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

// Midnight UTC of the Monday `weeksAgo` weeks back — the same boundary
// Postgres `date_trunc('week', ...)` lands on.
function mondayUtc(weeksAgo: number): Date {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(midnight - (sinceMonday + weeksAgo * 7) * 86_400_000);
}

function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function landing(journeyId: string, occurredAt: Date, properties: Record<string, string>) {
  return {
    journeyId,
    name: ANALYTICS_EVENTS.landingView,
    source: "browser" as const,
    dedupeKey: randomUUID(),
    occurredAt,
    properties,
  };
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
  // Removed: the live create -> journey -> ledger path this asserted is
  // deliberately dead. SubscriptionsService.create computes
  // `journeyId = isEnabled() ? null : ...`, and isEnabled() is hardcoded true,
  // so no journey row, no subscriptions.journey_id, and no subscription_created
  // ledger write happens for a new subscription. Same gate silences
  // telegram_linked and the journey->person stitch in linkChat. The remaining
  // tests here seed the ledger directly and still describe real dashboard
  // behaviour. See md/journal/migrations/analytics-real-metahunt-cutover.md.

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
    // Ordered chain: the journey missing subscription_created stops counting
    // from that step on, even though it has telegram_linked.
    expect(productionWeek.funnel.map((step) => step.journeys)).toEqual([4, 4, 3, 3]);
    expect(productionAll.funnel.map((step) => step.journeys)).toEqual([5, 5, 4, 4]);
    expect(tests.funnel.map((step) => step.journeys)).toEqual([1, 1, 1, 1]);
    expect(everyone.funnel.map((step) => step.journeys)).toEqual([5, 5, 4, 4]);
    expect(productionWeek.recentJourneys.every((journey) => !journey.isTest)).toBe(true);
    expect(tests.recentJourneys).toEqual([
      expect.objectContaining({ isTest: true, cohortId: "controlled-a" }),
    ]);
  });

  it("reports a journey that skipped the landing as bypass, not as funnel rows", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const start = new Date();
    await seedFunnelJourney({
      events: [
        { name: PRODUCT_FUNNEL_STEPS[1], occurredAt: start },
        { name: PRODUCT_FUNNEL_STEPS[3], occurredAt: new Date(start.getTime() + 60_000) },
      ],
    });

    const overview = await dashboard.overview("all");

    expect(overview.funnel.map((step) => step.journeys)).toEqual([0, 0, 0, 0]);
    expect(overview.funnelBypass).toBe(1);
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

  it("derives last action from user events only, and scopes the roster by it", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const joinedLongAgo = new Date(Date.now() - 10 * 86_400_000);
    const actedRecently = new Date(Date.now() - 2 * 3_600_000);
    const weSentRecently = new Date(Date.now() - 1 * 3_600_000);
    const activeJourneyId = randomUUID();
    const silentJourneyId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: activeJourneyId, origin: "browser", createdAt: joinedLongAgo },
      { id: silentJourneyId, origin: "browser", createdAt: joinedLongAgo },
    ]);
    const [activeSub] = await db
      .insert(subscriptions)
      .values({
        chatId: "chat-active",
        journeyId: activeJourneyId,
        params: {},
        isActive: true,
        createdAt: joinedLongAgo,
      })
      .returning({ id: subscriptions.id });
    const [silentSub] = await db
      .insert(subscriptions)
      .values({
        chatId: "chat-silent",
        journeyId: silentJourneyId,
        params: {},
        isActive: true,
        createdAt: joinedLongAgo,
      })
      .returning({ id: subscriptions.id });

    await db.insert(productEvents).values([
      {
        journeyId: activeJourneyId,
        subscriptionId: activeSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: actedRecently,
      },
      // Our own delivery, newer than the user's own action — must not count as
      // activity for either subscriber.
      {
        journeyId: activeJourneyId,
        subscriptionId: activeSub.id,
        name: ANALYTICS_EVENTS.digestSent,
        source: "worker" as const,
        dedupeKey: randomUUID(),
        occurredAt: weSentRecently,
      },
      {
        journeyId: silentJourneyId,
        subscriptionId: silentSub.id,
        name: ANALYTICS_EVENTS.digestSent,
        source: "worker" as const,
        dedupeKey: randomUUID(),
        occurredAt: weSentRecently,
      },
    ]);

    const allTime = await dashboard.overview("all");
    const roster = new Map(allTime.subscriberActivity.map((row) => [row.chatId, row]));
    expect(roster.get("chat-active")?.lastActionAt?.getTime()).toBe(actedRecently.getTime());
    expect(roster.get("chat-silent")?.lastActionAt).toBeNull();

    // 24h window: the long-ago joiner still shows up because they acted; the one
    // we merely sent a digest to drops out.
    const day = await dashboard.overview("24h");
    expect(day.subscriberActivity.map((row) => row.chatId)).toEqual(["chat-active"]);
  });

  it("classifies subscribers into active/dormant/churned and reports delivery health", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const recent = new Date(Date.now() - 2 * 86_400_000);
    const aliveJourneyId = randomUUID();
    const dormantJourneyId = randomUUID();
    const goneJourneyId = randomUUID();
    const blockedJourneyId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: aliveJourneyId, origin: "browser" },
      { id: dormantJourneyId, origin: "browser" },
      { id: goneJourneyId, origin: "browser" },
      { id: blockedJourneyId, origin: "browser" },
    ]);
    const [aliveSub] = await db
      .insert(subscriptions)
      .values({ chatId: "chat-alive", journeyId: aliveJourneyId, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    const [dormantSub] = await db
      .insert(subscriptions)
      .values({ chatId: "chat-dormant", journeyId: dormantJourneyId, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    await db.insert(subscriptions).values([
      {
        chatId: "chat-gone",
        journeyId: goneJourneyId,
        params: {},
        isActive: false,
        deactivatedReason: "user",
      },
      {
        chatId: "chat-blocked",
        journeyId: blockedJourneyId,
        params: {},
        isActive: false,
        deactivatedReason: "blocked",
      },
    ]);

    const digestSentRow = (journeyId: string, subscriptionId: string, offsetMs: number) => ({
      journeyId,
      subscriptionId,
      name: ANALYTICS_EVENTS.digestSent,
      source: "worker" as const,
      dedupeKey: randomUUID(),
      occurredAt: new Date(recent.getTime() + offsetMs),
    });

    await db.insert(productEvents).values([
      // Dormant: three digests landed inside the window, zero reactions.
      digestSentRow(dormantJourneyId, dormantSub.id, 0),
      digestSentRow(dormantJourneyId, dormantSub.id, 3_600_000),
      digestSentRow(dormantJourneyId, dormantSub.id, 7_200_000),
      // Alive: digests land too, but the user clicked back.
      digestSentRow(aliveJourneyId, aliveSub.id, 0),
      {
        journeyId: aliveJourneyId,
        subscriptionId: aliveSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: recent,
      },
      {
        journeyId: dormantJourneyId,
        subscriptionId: dormantSub.id,
        name: ANALYTICS_EVENTS.digestDeliveryFailed,
        source: "worker" as const,
        dedupeKey: randomUUID(),
        occurredAt: recent,
        properties: { failure_kind: "chat_unreachable" },
      },
    ]);

    const overview = await dashboard.overview("week");

    // The blocked chat counts as churned in the aggregate tiles (no active
    // subscriptions), but the roster tells the two apart per row.
    expect(overview.subscriberStates).toEqual({ active: 1, dormant: 1, churned: 2 });
    const statusByChat = new Map(
      overview.subscriberActivity.map((row) => [row.chatId, row.status]),
    );
    expect(statusByChat.get("chat-alive")).toBe("active");
    expect(statusByChat.get("chat-dormant")).toBe("dormant");
    expect(statusByChat.get("chat-gone")).toBe("churned");
    expect(statusByChat.get("chat-blocked")).toBe("blocked");
    expect(overview.delivery.digestsSent).toBe(4);
    expect(overview.delivery.chatsReached).toBe(2);
    expect(overview.delivery.unsubscribed).toBe(0);
    expect(overview.delivery.messagesPerChatPerDay).toBeGreaterThan(0);
    expect(overview.delivery.daily).toHaveLength(7);
    expect(overview.delivery.daily.reduce((sum, day) => sum + day.digests, 0)).toBe(4);
  });

  it("counts period flow from events and first-touch channels from landing utm", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const insideWindow = new Date(Date.now() - 3 * 3_600_000);
    const beforeWindow = new Date(Date.now() - 5 * 86_400_000);
    const redditJourneyId = randomUUID();
    const directJourneyId = randomUUID();
    const staleJourneyId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: redditJourneyId, origin: "browser", createdAt: insideWindow },
      { id: directJourneyId, origin: "browser", createdAt: insideWindow },
      { id: staleJourneyId, origin: "browser", createdAt: beforeWindow },
    ]);
    const [redditSub] = await db
      .insert(subscriptions)
      .values({
        chatId: "chat-reddit",
        journeyId: redditJourneyId,
        params: {},
        isActive: true,
        createdAt: insideWindow,
      })
      .returning({ id: subscriptions.id });

    await db.insert(productEvents).values([
      // First touch carries the campaign; a later untagged landing must not
      // overwrite it.
      {
        journeyId: redditJourneyId,
        name: ANALYTICS_EVENTS.landingView,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
        properties: { utm_source: "reddit", utm_campaign: "20260723-launch" },
      },
      {
        journeyId: redditJourneyId,
        name: ANALYTICS_EVENTS.landingView,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: new Date(insideWindow.getTime() + 60_000),
        properties: {},
      },
      {
        journeyId: redditJourneyId,
        name: ANALYTICS_EVENTS.subscriptionCreated,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
      },
      {
        journeyId: redditJourneyId,
        subscriptionId: redditSub.id,
        name: ANALYTICS_EVENTS.telegramLinked,
        source: "telegram" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
      },
      {
        journeyId: redditJourneyId,
        subscriptionId: redditSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
      },
      {
        journeyId: redditJourneyId,
        subscriptionId: redditSub.id,
        name: ANALYTICS_EVENTS.unsubscribed,
        source: "telegram" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
      },
      // Untagged visit with no referrer either → the "direct" channel row.
      {
        journeyId: directJourneyId,
        name: ANALYTICS_EVENTS.landingView,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
        properties: {},
      },
      {
        journeyId: directJourneyId,
        name: ANALYTICS_EVENTS.applyClicked,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: insideWindow,
      },
      // Landed before the window → excluded from the 24h channel table.
      {
        journeyId: staleJourneyId,
        name: ANALYTICS_EVENTS.landingView,
        source: "browser" as const,
        dedupeKey: randomUUID(),
        occurredAt: beforeWindow,
        properties: { utm_source: "dou" },
      },
    ]);

    const day = await dashboard.overview("24h");
    expect(day.flow).toEqual({
      joined: 1,
      activated: 1,
      digestClicks: 1,
      feedClicks: 1,
      churned: 1,
    });
    expect(day.channels).toEqual([
      {
        source: "reddit",
        campaign: "20260723-launch",
        landed: 1,
        subscribed: 1,
        activated: 1,
        digestClicks: 1,
      },
      { source: "direct", campaign: null, landed: 1, subscribed: 0, activated: 0, digestClicks: 0 },
    ]);

    const allTime = await dashboard.overview("all");
    expect(allTime.channels.map((row) => row.source)).toEqual(
      expect.arrayContaining(["reddit", "dou", "direct"]),
    );
  });

  it("attributes untagged landings by referrer and folds our own host into direct", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const at = new Date(Date.now() - 3_600_000);
    const threadsAppId = randomUUID();
    const threadsWebId = randomUUID();
    const internalId = randomUUID();
    const taggedId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: threadsAppId, origin: "browser" },
      { id: threadsWebId, origin: "browser" },
      { id: internalId, origin: "browser" },
      { id: taggedId, origin: "browser" },
    ]);

    await db.insert(productEvents).values([
      // Two different Threads hostnames must collapse into one channel row.
      landing(threadsAppId, at, { referrer_domain: "l.threads.com" }),
      landing(threadsWebId, at, { referrer_domain: "threads.net" }),
      // Our own host is internal navigation, not acquisition.
      landing(internalId, at, { referrer_domain: "www.metahunt.app" }),
      // An explicit tag outranks a referrer that says otherwise.
      landing(taggedId, at, { utm_source: "dou", referrer_domain: "l.threads.com" }),
    ]);

    const overview = await dashboard.overview("all", "production");
    const byChannel = new Map(overview.channels.map((row) => [row.source, row.landed]));

    expect(byChannel.get("threads")).toBe(2);
    expect(byChannel.get("direct")).toBe(1);
    expect(byChannel.get("dou")).toBe(1);
    expect(byChannel.has("metahunt.app")).toBe(false);
    expect(byChannel.has("www.metahunt.app")).toBe(false);
  });

  it("reports each subscriber's first-touch channel on their roster row", async () => {
    const dashboard = new ProductAnalyticsService(db);
    const at = new Date(Date.now() - 3_600_000);
    const referredId = randomUUID();
    const unknownId = randomUUID();

    await db.insert(analyticsJourneys).values([
      { id: referredId, origin: "browser" },
      { id: unknownId, origin: "browser" },
    ]);
    await db.insert(subscriptions).values([
      { chatId: "chat-from-threads", journeyId: referredId, params: {}, isActive: true },
      { chatId: "chat-from-nowhere", journeyId: unknownId, params: {}, isActive: true },
    ]);
    // Only the first journey ever landed; the second has no landing event, so it
    // has no channel rather than a fabricated "direct".
    await db.insert(productEvents).values([landing(referredId, at, { referrer_domain: "t.me" })]);

    const overview = await dashboard.overview("all", "production");
    const roster = new Map(overview.subscriberActivity.map((row) => [row.chatId, row.source]));

    expect(roster.get("chat-from-threads")).toBe("telegram");
    expect(roster.get("chat-from-nowhere")).toBeNull();
  });

  it("buckets growth and retention by the first link, ignoring the test population", async () => {
    const dashboard = new ProductAnalyticsService(db);
    // Anchors are pinned to a Monday so the assertion cannot drift with the
    // weekday the suite happens to run on (Postgres weeks start Monday, UTC).
    const oldAnchor = new Date(mondayUtc(3).getTime() + 86_400_000);
    const freshAnchor = new Date(mondayUtc(0).getTime() + 3_600_000);

    const returningJourneyId = randomUUID();
    const freshJourneyId = randomUUID();
    const testJourneyId = randomUUID();
    await db.insert(analyticsJourneys).values([
      { id: returningJourneyId, origin: "browser", createdAt: oldAnchor },
      { id: freshJourneyId, origin: "browser", createdAt: freshAnchor },
      { id: testJourneyId, origin: "browser", isTest: true, createdAt: oldAnchor },
    ]);

    const [returningSub] = await db
      .insert(subscriptions)
      .values({
        chatId: "chat-returning",
        journeyId: returningJourneyId,
        params: {},
        isActive: true,
        createdAt: oldAnchor,
        linkedAt: oldAnchor,
      })
      .returning({ id: subscriptions.id });
    await db.insert(subscriptions).values([
      {
        chatId: "chat-fresh",
        journeyId: freshJourneyId,
        params: {},
        isActive: true,
        createdAt: freshAnchor,
        linkedAt: freshAnchor,
      },
      {
        chatId: "chat-test-population",
        journeyId: testJourneyId,
        params: {},
        isActive: true,
        createdAt: oldAnchor,
        linkedAt: oldAnchor,
      },
    ]);

    await db.insert(productEvents).values([
      // Week 0 of its own anchor, then a gap, then week 2 — proves the offset is
      // rolling from that chat's link, not from the calendar week.
      {
        journeyId: returningJourneyId,
        subscriptionId: returningSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: new Date(oldAnchor.getTime() + 2 * 3_600_000),
      },
      {
        journeyId: returningJourneyId,
        subscriptionId: returningSub.id,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api" as const,
        dedupeKey: randomUUID(),
        occurredAt: new Date(oldAnchor.getTime() + 14 * 86_400_000 + 2 * 3_600_000),
      },
      // Ours, not theirs: a send must never mark a cohort as retained.
      {
        journeyId: freshJourneyId,
        name: ANALYTICS_EVENTS.digestSent,
        source: "worker" as const,
        dedupeKey: randomUUID(),
        occurredAt: new Date(freshAnchor.getTime() + 3_600_000),
      },
    ]);

    const overview = await dashboard.overview("all", "production");

    expect(overview.growth.totalLinked).toBe(2);
    expect(overview.growth.current).toBe(1);
    const byWeek = new Map(overview.growth.weeks.map((week) => [week.weekStart, week]));
    expect(byWeek.get(isoDate(mondayUtc(3)))?.linked).toBe(1);
    expect(byWeek.get(isoDate(mondayUtc(2)))?.linked).toBe(0);
    expect(byWeek.get(isoDate(mondayUtc(0)))?.cumulative).toBe(2);

    const cohorts = new Map(overview.retention.cohorts.map((row) => [row.weekStart, row]));
    expect(cohorts.get(isoDate(mondayUtc(3)))).toEqual({
      weekStart: isoDate(mondayUtc(3)),
      size: 1,
      returned: [1, 0, 1, 0, 0, 0],
    });
    // Linked but never acted: it counts in the denominator and nowhere else.
    expect(cohorts.get(isoDate(mondayUtc(0)))).toEqual({
      weekStart: isoDate(mondayUtc(0)),
      size: 1,
      returned: [0, 0, 0, 0, 0, 0],
    });
    expect([...cohorts.keys()]).not.toContain("chat-test-population");
    expect(overview.retention.cohorts.reduce((sum, row) => sum + row.size, 0)).toBe(2);
  });
});
