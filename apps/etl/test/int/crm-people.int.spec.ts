import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { ProductAnalyticsService } from "../../src/admin/product-analytics/product-analytics.service";
import { ANALYTICS_EVENTS } from "../../src/platform/analytics/events";

import { makeTestDb } from "./db";

const { analyticsJourneys, productEvents, subscriptions, users } = schema;
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const TELEGRAM_PERSON_ID = "22222222-2222-2222-2222-222222222222";
const JOURNEY_ID = "33333333-3333-3333-3333-333333333333";

let db: DrizzleDB;
let pool: Pool;
let service: ProductAnalyticsService;

beforeAll(() => {
  ({ db, pool } = makeTestDb());
  service = new ProductAnalyticsService(db);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

it("returns account-only and Telegram people with period-scoped click metrics", async () => {
  await db.insert(users).values({ id: ACCOUNT_ID, source: "google-login" });
  await db.insert(analyticsJourneys).values({ id: JOURNEY_ID, personId: TELEGRAM_PERSON_ID });
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      personId: TELEGRAM_PERSON_ID,
      journeyId: JOURNEY_ID,
      chatId: "private-chat",
      params: {},
      isActive: true,
    })
    .returning({ id: subscriptions.id });
  await db.insert(productEvents).values([
    {
      journeyId: JOURNEY_ID,
      subscriptionId: subscription.id,
      name: ANALYTICS_EVENTS.applyClicked,
      source: "browser",
      dedupeKey: "crm-feed-click",
      properties: {},
    },
    {
      journeyId: JOURNEY_ID,
      subscriptionId: subscription.id,
      name: ANALYTICS_EVENTS.digestLinkClicked,
      source: "api",
      dedupeKey: "crm-telegram-click",
      properties: {},
    },
  ]);

  const page = await service.people("week", { sort: "recent", offset: 0 });

  expect(page.metrics).toEqual({ knownPeople: 2, telegramConnected: 1, jobClickers: 1, atRisk: 0 });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.id === ACCOUNT_ID)).toMatchObject({
    hasAccount: true,
    hasTelegram: false,
    subscriptions: 0,
    state: "no_subscription",
  });
  expect(page.rows.find((row) => row.id === TELEGRAM_PERSON_ID)).toMatchObject({
    hasAccount: false,
    hasTelegram: true,
    subscriptions: 1,
    feedClicks: 1,
    telegramClicks: 1,
    state: "active",
  });
  await expect(
    service.people("week", { q: TELEGRAM_PERSON_ID.slice(0, 8), sort: "recent", offset: 0 }),
  ).resolves.toMatchObject({
    total: 1,
    rows: [expect.objectContaining({ id: TELEGRAM_PERSON_ID })],
  });
  await expect(
    service.people("week", { q: "not-a-person", sort: "recent", offset: 50 }),
  ).resolves.toMatchObject({
    metrics: { knownPeople: 2, telegramConnected: 1, jobClickers: 1, atRisk: 0 },
    rows: [],
    total: 0,
  });
  await expect(
    db
      .select({ personId: subscriptions.personId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id)),
  ).resolves.toEqual([{ personId: TELEGRAM_PERSON_ID }]);
});
