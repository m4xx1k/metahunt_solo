import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, schema, type DrizzleDB } from "@metahunt/database";

import { ProductAnalyticsService } from "../../src/admin/product-analytics/product-analytics.service";
import {
  PostHogQueryClient,
  type PostHogQueryRow,
} from "../../src/platform/analytics/posthog-query.client";

import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup } from "./vacancy-fixture";

const { rssIngests, rssRecords, sentNotifications, sources, subscriptions } = schema;
const SEEDED_AT = new Date("2026-01-01T00:00:00.000Z");

const PERSON_A = "11111111-1111-1111-1111-111111111111";
const PERSON_B = "22222222-2222-2222-2222-222222222222";
const CHAT_A = "chat-a";
const CHAT_B = "chat-b";
const DAY = 86_400_000;

let db: DrizzleDB;
let pool: Pool;
let service: ProductAnalyticsService;
// Whatever the fake PostHog returns for the next personActivity() call, keyed
// by person id. The queries themselves are proved against production in
// md/journal/migrations/analytics-one-identity.md; what these tests pin is how
// the service folds a person's behaviour onto a chat.
let postHogRows: PostHogQueryRow[] = [];
let postHogAvailable = true;

function person(
  key: string,
  over: Partial<{
    last_action_at: string | null;
    acted_since: string | null;
    feed_clicks: number;
    digest_clicks: number;
    referrer: string;
  }> = {},
): PostHogQueryRow {
  return {
    person_key: key,
    last_action_at: null,
    acted_since: null,
    feed_clicks: 0,
    digest_clicks: 0,
    referrer: "direct",
    ...over,
  };
}

let sequence = 0;

async function seedVacancy(): Promise<string> {
  const suffix = ++sequence;
  const [source] = await db
    .insert(sources)
    .values({ code: `pa-${suffix}`, displayName: "Fixture", baseUrl: "https://example.test" })
    .returning({ id: sources.id });
  const [ingest] = await db
    .insert(rssIngests)
    .values({ sourceId: source.id, triggeredBy: "fixture", startedAt: SEEDED_AT })
    .returning({ id: rssIngests.id });
  const [record] = await db
    .insert(rssRecords)
    .values({
      sourceId: source.id,
      rssIngestId: ingest.id,
      externalId: `pa-${suffix}`,
      hash: `pa-${suffix}`,
      title: "Fixture Backend Engineer",
      link: "https://example.test/job",
      publishedAt: SEEDED_AT,
    })
    .returning({ id: rssRecords.id });
  return insertVacancyWithGroup(db, {
    sourceId: source.id,
    externalId: `pa-${suffix}`,
    lastRssRecordId: record.id,
    title: "Fixture Backend Engineer",
    loadedAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  });
}

// A digest is one send: several vacancy rows written inside the same hour for
// one subscription. Spread the rows by seconds, the way a real send does.
async function seedDigest(subscriptionId: string, at: Date, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const vacancyId = await seedVacancy();
    await db.insert(sentNotifications).values({
      subscriptionId,
      vacancyId,
      sentAt: new Date(at.getTime() + index * 1_000),
    });
  }
}

beforeAll(async () => {
  ({ db, pool } = makeTestDb());
  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductAnalyticsService,
      { provide: DRIZZLE, useValue: db },
      {
        provide: PostHogQueryClient,
        useValue: {
          isAvailable: () => postHogAvailable,
          query: async () => (postHogAvailable ? postHogRows : null),
        },
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
  postHogAvailable = true;
  await db.execute(
    sql`TRUNCATE TABLE sent_notifications, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
  await truncateAll(db);
});

describe("subscriber roster", () => {
  // Two subscriptions, one chat, one person. Keying behaviour on the person is
  // what makes this safe: the old ledger attributed feed clicks to a journey and
  // had to refuse to roll them up whenever a journey had more than one
  // subscription, or it would have counted the same tap twice.
  it("counts a person's clicks once for a chat that runs two subscriptions", async () => {
    const [first, second] = await db
      .insert(subscriptions)
      .values([
        { personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true },
        { personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true },
      ])
      .returning({ id: subscriptions.id });
    expect(first.id).not.toEqual(second.id);
    postHogRows = [person(PERSON_A, { feed_clicks: 4, digest_clicks: 3 })];

    const overview = await service.overview("all");

    expect(overview.subscriberActivity).toHaveLength(1);
    expect(overview.subscriberActivity[0]).toMatchObject({
      chatId: CHAT_A,
      feedClicks: 4,
      vacancyClicks: 3,
      subscriptions: expect.arrayContaining([expect.objectContaining({ isActive: true })]),
    });
    expect(overview.subscriberActivity[0].subscriptions).toHaveLength(2);
  });

  // `linked_at` is the domain fact. The ledger's `telegram_linked` event agreed
  // with it on all 40 production rows, and the column also covers subscriptions
  // that predate the event — so the column is the source, not the event.
  it("reads telegramLinkedAt from the subscription, not from an event store", async () => {
    const linkedAt = new Date(Date.now() - 3 * DAY);
    await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true, linkedAt });

    const overview = await service.overview("all");

    expect(overview.subscriberActivity[0].telegramLinkedAt?.toISOString()).toEqual(
      linkedAt.toISOString(),
    );
  });

  it("keeps the roster whole when PostHog is unreachable", async () => {
    postHogAvailable = false;
    await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true });

    const overview = await service.overview("all");

    expect(overview.subscriberActivity).toHaveLength(1);
    expect(overview.subscriberActivity[0]).toMatchObject({
      chatId: CHAT_A,
      feedClicks: 0,
      vacancyClicks: 0,
      lastActionAt: null,
      source: null,
    });
  });

  // The period filters on "joined in it OR acted in it": filtering on the join
  // date alone empties `24h` even though older subscribers are the ones clicking.
  it("keeps an old subscriber in a short window when they acted inside it", async () => {
    await db.insert(subscriptions).values({
      personId: PERSON_A,
      chatId: CHAT_A,
      params: {},
      isActive: true,
      createdAt: new Date(Date.now() - 40 * DAY),
    });
    postHogRows = [
      person(PERSON_A, { last_action_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
    ];

    const overview = await service.overview("24h");

    expect(overview.subscriberActivity.map((row) => row.chatId)).toEqual([CHAT_A]);
  });
});

describe("subscriber states", () => {
  // Dormant is the churn early-warning: digests are landing and nobody answers.
  // It needs both halves — enough recent sends AND silence.
  it("separates dormant from active on recent sends and recent silence", async () => {
    const [dormant] = await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    const [answered] = await db
      .insert(subscriptions)
      .values({ personId: PERSON_B, chatId: CHAT_B, params: {}, isActive: true })
      .returning({ id: subscriptions.id });

    for (const day of [1, 2, 3]) {
      const at = new Date(Date.now() - day * DAY);
      await seedDigest(dormant.id, at, 2);
      await seedDigest(answered.id, at, 1);
    }
    postHogRows = [person(PERSON_B, { acted_since: new Date(Date.now() - 2 * DAY).toISOString() })];

    const overview = await service.overview("all");

    expect(overview.subscriberStates).toEqual({ active: 1, dormant: 1, churned: 0 });
    const byChat = new Map(overview.subscriberActivity.map((row) => [row.chatId, row.status]));
    expect(byChat.get(CHAT_A)).toEqual("dormant");
    expect(byChat.get(CHAT_B)).toEqual("active");
  });

  it("holds a silent subscriber active until enough digests have actually landed", async () => {
    const [quiet] = await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    await seedDigest(quiet.id, new Date(Date.now() - DAY), 1);

    const overview = await service.overview("all");

    expect(overview.subscriberStates).toEqual({ active: 1, dormant: 0, churned: 0 });
  });

  // Blocked outranks churned on the row: both mean "no active subs", but the
  // user did not press unsubscribe — the bot was cut off.
  it("counts a deactivated chat as churned and marks a blocked one blocked", async () => {
    await db.insert(subscriptions).values([
      {
        personId: PERSON_A,
        chatId: CHAT_A,
        params: {},
        isActive: false,
        deactivatedReason: "user",
      },
      {
        personId: PERSON_B,
        chatId: CHAT_B,
        params: {},
        isActive: false,
        deactivatedReason: "blocked",
      },
    ]);

    const overview = await service.overview("all");

    expect(overview.subscriberStates).toEqual({ active: 0, dormant: 0, churned: 2 });
    const byChat = new Map(overview.subscriberActivity.map((row) => [row.chatId, row.status]));
    expect(byChat.get(CHAT_A)).toEqual("churned");
    expect(byChat.get(CHAT_B)).toEqual("blocked");
  });
});

describe("delivery health", () => {
  // The whole delivery rewrite rests on this: rows land one per vacancy, each
  // with its own `sent_at`, and the schedule is hourly — so the hour is the
  // send. Six rows in two hours are two digests, never six.
  it("counts one digest per subscription per hour, not one per vacancy", async () => {
    const [sub] = await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    const morning = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const later = new Date(morning.getTime() + 2 * 60 * 60 * 1000);
    await seedDigest(sub.id, morning, 4);
    await seedDigest(sub.id, later, 2);

    const overview = await service.overview("all");

    expect(overview.delivery.digestsSent).toEqual(2);
    expect(overview.delivery.chatsReached).toEqual(1);
    expect(overview.delivery.daily.at(-1)).toMatchObject({ digests: 2, chats: 1, perChat: 2 });
  });

  it("reports seven daily buckets and leaves a quiet day at zero", async () => {
    const [sub] = await db
      .insert(subscriptions)
      .values({ personId: PERSON_A, chatId: CHAT_A, params: {}, isActive: true })
      .returning({ id: subscriptions.id });
    await seedDigest(sub.id, new Date(Date.now() - 2 * DAY), 1);

    const overview = await service.overview("all");

    expect(overview.delivery.daily).toHaveLength(7);
    expect(overview.delivery.daily.filter((day) => day.digests > 0)).toHaveLength(1);
    expect(overview.delivery.daily.at(-1)).toMatchObject({ digests: 0, chats: 0, perChat: 0 });
  });
});
