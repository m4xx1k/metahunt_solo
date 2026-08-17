import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { AnalyticsOutboxStore } from "../../src/platform/analytics/analytics-outbox.store";
import { ANALYTICS_EVENTS } from "../../src/platform/analytics/events";

import { makeTestDb } from "./db";

const { analyticsJourneys, subscriptions, users } = schema;

let db: DrizzleDB;
let pool: Pool;

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE product_events, analytics_outbox, analytics_journeys, subscriptions, users RESTART IDENTITY CASCADE`,
  );
});

// Mirrors ProductEventStore.ensureJourney: a fresh journey is its own person.
async function seedJourney(): Promise<string> {
  const journeyId = randomUUID();
  await db
    .insert(analyticsJourneys)
    .values({ id: journeyId, personId: journeyId, origin: "browser" });
  return journeyId;
}

async function seedSubscription(): Promise<{
  subscriptionId: string;
  personId: string;
  journeyId: string;
}> {
  const [user] = await db.insert(users).values({ source: "test" }).returning({ id: users.id });
  const journeyId = await seedJourney();
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId: user.id, journeyId, params: {} })
    .returning({ id: subscriptions.id, personId: subscriptions.personId });
  return { subscriptionId: subscription.id, personId: subscription.personId, journeyId };
}

// The drain query only exists against real Postgres: it claims rows with a
// row lock and outer-joins subscriptions, and neither survives a mock. A bare
// `FOR UPDATE` over that outer join is rejected by Postgres outright.
describe("analytics outbox drain", () => {
  it("hands back the subscription's person, not the journey's", async () => {
    const store = new AnalyticsOutboxStore(db);
    const { subscriptionId, personId, journeyId } = await seedSubscription();

    await store.enqueue({
      journeyId,
      subscriptionId,
      name: ANALYTICS_EVENTS.digestSent,
      source: "worker",
      dedupeKey: "delivery-1",
      properties: { vacancies: 3 },
    });

    const drained = await store.drain(100);

    expect(drained).toHaveLength(1);
    expect(drained[0].personId).toBe(personId);
    expect(drained[0].personId).not.toBe(journeyId);
    expect(drained[0].name).toBe(ANALYTICS_EVENTS.digestSent);
  });

  it("materializes the ledger row and never drains the same event twice", async () => {
    const store = new AnalyticsOutboxStore(db);
    const { subscriptionId, journeyId } = await seedSubscription();

    await store.enqueue({
      journeyId,
      subscriptionId,
      name: ANALYTICS_EVENTS.unsubscribed,
      source: "telegram",
      dedupeKey: "unsubscribed-1",
      properties: {},
    });
    await store.drain(100);

    const ledger = await db.execute<{ count: string }>(sql`SELECT COUNT(*) FROM product_events`);
    expect(Number(ledger.rows[0].count)).toBe(1);
    await expect(store.drain(100)).resolves.toEqual([]);
  });

  it("falls back to the journey's person for an event with no subscription", async () => {
    const store = new AnalyticsOutboxStore(db);
    const journeyId = await seedJourney();

    await store.enqueue({
      journeyId,
      name: ANALYTICS_EVENTS.applyClicked,
      source: "browser",
      dedupeKey: "apply-1",
      properties: {},
    });

    const [drained] = await store.drain(100);

    expect(drained.personId).toBe(journeyId);
  });
});
