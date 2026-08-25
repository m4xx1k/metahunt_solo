import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, schema, type DrizzleDB } from "@metahunt/database";

import { ProductAnalyticsService } from "../../src/admin/product-analytics/product-analytics.service";
import {
  PostHogQueryClient,
  type PostHogQueryRow,
} from "../../src/platform/analytics/posthog-query.client";

import { makeTestDb } from "./db";

const { subscriptions, users } = schema;
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const TELEGRAM_PERSON_ID = "22222222-2222-2222-2222-222222222222";

let db: DrizzleDB;
let pool: Pool;
let service: ProductAnalyticsService;
let postHogRows: PostHogQueryRow[] = [];

beforeAll(async () => {
  ({ db, pool } = makeTestDb());
  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductAnalyticsService,
      { provide: DRIZZLE, useValue: db },
      {
        provide: PostHogQueryClient,
        useValue: { isAvailable: () => true, query: async () => postHogRows },
      },
    ],
  }).compile();
  service = moduleRef.get(ProductAnalyticsService);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  postHogRows = [];
  await db.execute(
    sql`TRUNCATE TABLE sent_notifications, product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

// The spine is "who exists": an account, or a subscription's person. Behaviour
// hangs off it, so a person with no PostHog row is still a row here.
it("returns account-only and Telegram people with their click metrics", async () => {
  await db.insert(users).values({ id: ACCOUNT_ID, source: "google-login" });
  await db.insert(subscriptions).values({
    personId: TELEGRAM_PERSON_ID,
    chatId: "private-chat",
    params: {},
    isActive: true,
  });
  postHogRows = [
    {
      person_key: TELEGRAM_PERSON_ID,
      last_action_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      acted_since: null,
      feed_clicks: 1,
      digest_clicks: 1,
      referrer: "direct",
    },
  ];

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
});

// An active subscription that has done nothing in the window is the whole point
// of the at-risk tile — it must not read as active just because it is enabled.
it("marks a silent active subscriber at risk and keeps metrics off the filtered page", async () => {
  await db.insert(subscriptions).values({
    personId: TELEGRAM_PERSON_ID,
    chatId: "private-chat",
    params: {},
    isActive: true,
  });

  await expect(service.people("week", { sort: "at_risk", offset: 0 })).resolves.toMatchObject({
    metrics: { knownPeople: 1, telegramConnected: 1, jobClickers: 0, atRisk: 1 },
    rows: [expect.objectContaining({ id: TELEGRAM_PERSON_ID, state: "at_risk" })],
  });

  await expect(
    service.people("week", { q: "not-a-person", sort: "recent", offset: 0 }),
  ).resolves.toMatchObject({
    metrics: { knownPeople: 1, telegramConnected: 1, jobClickers: 0, atRisk: 1 },
    rows: [],
    total: 0,
  });
});

it("searches by id prefix and display name", async () => {
  await db.insert(subscriptions).values({
    personId: TELEGRAM_PERSON_ID,
    chatId: "private-chat",
    params: {},
    isActive: true,
    tgFirstName: "Tester",
  });

  await expect(
    service.people("week", { q: TELEGRAM_PERSON_ID.slice(0, 8), sort: "recent", offset: 0 }),
  ).resolves.toMatchObject({
    total: 1,
    rows: [expect.objectContaining({ id: TELEGRAM_PERSON_ID, displayName: "Tester" })],
  });
  await expect(
    service.people("week", { q: "test", sort: "recent", offset: 0 }),
  ).resolves.toMatchObject({ total: 1 });
});
