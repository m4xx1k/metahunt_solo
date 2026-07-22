import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import type { VacancyDto } from "../../src/03-discovery/feed/feed.contract";
import { SentNotificationsService } from "../../src/04-notify/telegram/sent-notifications.service";
import type { DigestMatch } from "../../src/04-notify/telegram/subscription-matcher.service";
import { DigestService } from "../../src/04-notify/telegram/digest.service";
import {
  SubscriptionsService,
  type ActiveSubscription,
} from "../../src/04-notify/telegram/subscriptions.service";
import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";

import { makeTestDb, truncateAll } from "./db";

const {
  digestDeliveries,
  sentNotifications,
  sources,
  rssIngests,
  rssRecords,
  subscriptions,
  vacancies,
} = schema;
const WINDOW_START = new Date("2026-01-01T00:00:00.000Z");
const VACANCY_LOADED_AT = new Date("2026-01-02T00:00:00.000Z");

let db: DrizzleDB;
let pool: Pool;
let sequence = 0;

class FixtureTelegram {
  readonly messages: { chatId: string; html: string }[] = [];
  failNext = false;

  async sendMessage(chatId: string, html: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("fixture telegram outage");
    }
    this.messages.push({ chatId, html });
  }
}

function fixtureVacancy(id: string): VacancyDto {
  return {
    id,
    externalId: "fixture-vacancy",
    rssRecordId: "fixture-rss-record",
    source: { id: "fixture-source", code: "fixture", displayName: "Fixture" },
    link: "https://example.test/job",
    publishedAt: VACANCY_LOADED_AT.toISOString(),
    loadedAt: VACANCY_LOADED_AT.toISOString(),
    updatedAt: VACANCY_LOADED_AT.toISOString(),
    title: "Fixture Backend Engineer",
    description: null,
    company: null,
    role: { id: "fixture-role", name: "Backend Engineer" },
    domain: null,
    skills: { required: [], optional: [] },
    seniority: "MIDDLE",
    workFormat: "REMOTE",
    employmentType: null,
    englishLevel: null,
    experienceYears: null,
    engagementType: null,
    hasTestAssignment: false,
    hasReservation: false,
    salary: { min: null, max: null, currency: null },
    locations: [],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
  };
}

async function seedActiveSubscription(): Promise<ActiveSubscription> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      chatId: "fixture-chat",
      params: {},
      isActive: true,
      createdAt: WINDOW_START,
    })
    .returning({
      id: subscriptions.id,
      chatId: subscriptions.chatId,
      candidateId: subscriptions.candidateId,
      params: subscriptions.params,
      createdAt: subscriptions.createdAt,
    });
  if (!row.chatId) throw new Error("fixture subscription needs chat id");
  return { ...row, chatId: row.chatId };
}

async function seedVacancy(): Promise<string> {
  const suffix = ++sequence;
  const [source] = await db
    .insert(sources)
    .values({ code: `fixture-${suffix}`, displayName: "Fixture", baseUrl: "https://example.test" })
    .returning({ id: sources.id });
  const [ingest] = await db
    .insert(rssIngests)
    .values({ sourceId: source.id, triggeredBy: "fixture", startedAt: VACANCY_LOADED_AT })
    .returning({ id: rssIngests.id });
  const [record] = await db
    .insert(rssRecords)
    .values({
      sourceId: source.id,
      rssIngestId: ingest.id,
      externalId: `fixture-${suffix}`,
      hash: `fixture-${suffix}`,
      title: "Fixture Backend Engineer",
      link: "https://example.test/job",
      publishedAt: VACANCY_LOADED_AT,
    })
    .returning({ id: rssRecords.id });
  const [vacancy] = await db
    .insert(vacancies)
    .values({
      sourceId: source.id,
      externalId: `fixture-${suffix}`,
      lastRssRecordId: record.id,
      title: "Fixture Backend Engineer",
      loadedAt: VACANCY_LOADED_AT,
      updatedAt: VACANCY_LOADED_AT,
    })
    .returning({ id: vacancies.id });
  return vacancy.id;
}

function fixtureMatcher(
  sent: SentNotificationsService,
  vacancyId: string,
): { matchNew(sub: ActiveSubscription): Promise<DigestMatch> } {
  return {
    async matchNew(sub) {
      const alreadySent = await sent.sentVacancyIds(sub.id, sub.createdAt);
      const items = alreadySent.includes(vacancyId) ? [] : [fixtureVacancy(vacancyId)];
      return { items, total: items.length, label: "fixture" };
    },
  };
}

function makeDigest(
  subscriptionsService: SubscriptionsService,
  sent: SentNotificationsService,
  matcher: { matchNew(sub: ActiveSubscription): Promise<DigestMatch> },
  telegram: FixtureTelegram,
): DigestService {
  return new DigestService(
    { get: () => "https://api.fixture.test" } as never,
    matcher as never,
    subscriptionsService,
    sent,
    telegram as never,
    {
      digestEvaluated: jest.fn(),
      digestSent: jest.fn(),
      digestDeliveryFailed: jest.fn(),
    } as never,
  );
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE sent_notifications, subscriptions RESTART IDENTITY CASCADE`);
  await truncateAll(db);
});

describe("digest fixture flow", () => {
  it("delivers once and records the ledger so a repeat sends no duplicate", async () => {
    const subscription = await seedActiveSubscription();
    const vacancyId = await seedVacancy();
    const sent = new SentNotificationsService(db, { enqueueDigestSent: jest.fn() } as never);
    const service = makeDigest(
      new SubscriptionsService(
        db,
        { subscriptionCreated: jest.fn() } as never,
        new NodeSlugResolver(db),
      ),
      sent,
      fixtureMatcher(sent, vacancyId),
      new FixtureTelegram(),
    );

    await expect(service.deliver(subscription.id)).resolves.toBe(1);
    await expect(service.deliver(subscription.id)).resolves.toBe(0);
    expect(
      await db
        .select()
        .from(sentNotifications)
        .where(eq(sentNotifications.subscriptionId, subscription.id)),
    ).toHaveLength(1);
    await expect(
      db
        .select({ status: digestDeliveries.status, isFirstDigest: digestDeliveries.isFirstDigest })
        .from(digestDeliveries)
        .where(eq(digestDeliveries.subscriptionId, subscription.id)),
    ).resolves.toEqual([{ status: "completed", isFirstDigest: true }]);
  });

  it("does not record a vacancy when delivery fails, then sends it on retry", async () => {
    const subscription = await seedActiveSubscription();
    const vacancyId = await seedVacancy();
    const sent = new SentNotificationsService(db, { enqueueDigestSent: jest.fn() } as never);
    const telegram = new FixtureTelegram();
    telegram.failNext = true;
    const service = makeDigest(
      new SubscriptionsService(
        db,
        { subscriptionCreated: jest.fn() } as never,
        new NodeSlugResolver(db),
      ),
      sent,
      fixtureMatcher(sent, vacancyId),
      telegram,
    );

    await expect(service.deliver(subscription.id)).rejects.toThrow("fixture telegram outage");
    expect(await db.select().from(sentNotifications)).toHaveLength(0);
    await expect(
      db
        .select({ status: digestDeliveries.status, isFirstDigest: digestDeliveries.isFirstDigest })
        .from(digestDeliveries)
        .where(eq(digestDeliveries.subscriptionId, subscription.id)),
    ).resolves.toEqual([{ status: "pending", isFirstDigest: true }]);
    await expect(service.deliver(subscription.id)).resolves.toBe(1);
    expect(telegram.messages).toHaveLength(1);
    await expect(
      db
        .select({ status: digestDeliveries.status, isFirstDigest: digestDeliveries.isFirstDigest })
        .from(digestDeliveries)
        .where(eq(digestDeliveries.subscriptionId, subscription.id)),
    ).resolves.toEqual([{ status: "completed", isFirstDigest: true }]);
  });

  it("does nothing after a subscription is paused", async () => {
    const subscription = await seedActiveSubscription();
    const vacancyId = await seedVacancy();
    const sent = new SentNotificationsService(db, { enqueueDigestSent: jest.fn() } as never);
    const telegram = new FixtureTelegram();
    const service = makeDigest(
      new SubscriptionsService(
        db,
        { subscriptionCreated: jest.fn() } as never,
        new NodeSlugResolver(db),
      ),
      sent,
      fixtureMatcher(sent, vacancyId),
      telegram,
    );
    await db
      .update(subscriptions)
      .set({ isActive: false })
      .where(eq(subscriptions.id, subscription.id));

    await expect(service.deliver(subscription.id)).resolves.toBe(0);
    expect(telegram.messages).toHaveLength(0);
    expect(await db.select().from(sentNotifications)).toHaveLength(0);
  });
});
