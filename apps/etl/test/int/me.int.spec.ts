import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { MeService } from "../../src/account/me.service";

import { makeTestDb, truncateAll } from "./db";

const {
  authIdentities,
  users,
  candidates,
  userCvs,
  sentNotifications,
  sources,
  rssIngests,
  rssRecords,
  subscriptions,
  vacancies,
} = schema;

let db: DrizzleDB;
let pool: Pool;
const subscriptionReactivated = jest.fn();
const unsubscribed = jest.fn();

function makeService(): MeService {
  return new MeService(db, {} as never, { subscriptionReactivated, unsubscribed } as never);
}

async function seedUser(): Promise<string> {
  const [user] = await db.insert(users).values({ source: "test" }).returning({ id: users.id });
  return user.id;
}

let hashSeq = 0;
async function seedCandidate(role = "Backend Developer"): Promise<string> {
  hashSeq += 1;
  const [candidate] = await db
    .insert(candidates)
    .values({ contentHash: `hash-${hashSeq}`, sourceText: "", extracted: {}, role })
    .returning({ id: candidates.id });
  return candidate.id;
}

async function link(userId: string, candidateId: string): Promise<string> {
  const [row] = await db
    .insert(userCvs)
    .values({ userId, candidateId, label: "CV", isActive: true })
    .returning({ id: userCvs.id });
  return row.id;
}

async function addTelegramIdentity(userId: string, telegramId: string): Promise<void> {
  await db.insert(authIdentities).values({
    userId,
    provider: "telegram",
    providerUserId: telegramId,
  });
}

async function seedSubscription(values: {
  userId?: string;
  chatId?: string;
  candidateId?: string;
}): Promise<string> {
  const [row] = await db
    .insert(subscriptions)
    .values({ ...values, params: {}, isActive: true })
    .returning({ id: subscriptions.id });
  return row.id;
}

let vacancySeq = 0;
async function seedVacancy(): Promise<string> {
  vacancySeq += 1;
  const code = `account-delete-${vacancySeq}`;
  const [source] = await db
    .insert(sources)
    .values({ code, displayName: code, baseUrl: "https://example.test" })
    .returning({ id: sources.id });
  const [ingest] = await db
    .insert(rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: rssIngests.id });
  const [record] = await db
    .insert(rssRecords)
    .values({
      sourceId: source.id,
      rssIngestId: ingest.id,
      externalId: code,
      hash: code,
      title: "Backend Engineer",
      publishedAt: new Date(),
    })
    .returning({ id: rssRecords.id });
  const [vacancy] = await db
    .insert(vacancies)
    .values({
      sourceId: source.id,
      externalId: code,
      lastRssRecordId: record.id,
      title: "Backend Engineer",
    })
    .returning({ id: vacancies.id });
  return vacancy.id;
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

afterEach(async () => {
  subscriptionReactivated.mockReset();
  unsubscribed.mockReset();
  await db.execute(
    sql`TRUNCATE TABLE sent_notifications, subscriptions, user_cvs, auth_identities, users RESTART IDENTITY CASCADE`,
  );
  await truncateAll(db);
});

describe("MeService.setSubscriptionActive (integration)", () => {
  it("keeps lifecycle timestamps and events aligned across pause and resume", async () => {
    const me = makeService();
    const userId = await seedUser();
    const subscriptionId = await seedSubscription({ userId });

    await expect(me.setSubscriptionActive(userId, subscriptionId, false)).resolves.toBe(true);
    const [paused] = await db
      .select({ isActive: subscriptions.isActive, deactivatedAt: subscriptions.deactivatedAt })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    expect(paused.isActive).toBe(false);
    expect(paused.deactivatedAt).toBeInstanceOf(Date);
    expect(unsubscribed).toHaveBeenCalledWith({
      method: "account",
      subscriptionId,
    });

    await expect(me.setSubscriptionActive(userId, subscriptionId, true)).resolves.toBe(true);
    const [resumed] = await db
      .select({ isActive: subscriptions.isActive, deactivatedAt: subscriptions.deactivatedAt })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId));
    expect(resumed.isActive).toBe(true);
    expect(resumed.deactivatedAt).toBeNull();
    expect(subscriptionReactivated).toHaveBeenCalledWith(subscriptionId);
  });

  it("treats an already-applied state as success without duplicating events", async () => {
    const me = makeService();
    const userId = await seedUser();
    const subscriptionId = await seedSubscription({ userId });

    await expect(me.setSubscriptionActive(userId, subscriptionId, true)).resolves.toBe(true);
    expect(subscriptionReactivated).not.toHaveBeenCalled();
    expect(unsubscribed).not.toHaveBeenCalled();
  });
});

describe("MeService.deleteAccount (integration)", () => {
  it("deletes identity, CV data, all Telegram-chat subscriptions, and notification history", async () => {
    const me = makeService();
    const userId = await seedUser();
    const candidateId = await seedCandidate();
    await link(userId, candidateId);
    await addTelegramIdentity(userId, "telegram-1");
    const ownedSubscription = await seedSubscription({ userId, candidateId });
    const chatSubscription = await seedSubscription({ chatId: "telegram-1" });
    const retainedSubscription = await seedSubscription({ chatId: "someone-else" });
    const vacancyId = await seedVacancy();
    await db.insert(sentNotifications).values([
      { subscriptionId: ownedSubscription, vacancyId },
      { subscriptionId: chatSubscription, vacancyId },
      { subscriptionId: retainedSubscription, vacancyId },
    ]);

    await expect(me.deleteAccount(userId)).resolves.toBe(true);

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(
      await db.select().from(authIdentities).where(eq(authIdentities.userId, userId)),
    ).toHaveLength(0);
    expect(await db.select().from(userCvs).where(eq(userCvs.userId, userId))).toHaveLength(0);
    expect(await db.select().from(candidates).where(eq(candidates.id, candidateId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.id, ownedSubscription)),
    ).toHaveLength(0);
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.id, chatSubscription)),
    ).toHaveLength(0);
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.id, retainedSubscription)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(sentNotifications)
        .where(eq(sentNotifications.subscriptionId, ownedSubscription)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(sentNotifications)
        .where(eq(sentNotifications.subscriptionId, chatSubscription)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(sentNotifications)
        .where(eq(sentNotifications.subscriptionId, retainedSubscription)),
    ).toHaveLength(1);
  });

  it("keeps a legacy shared candidate and the remaining owner's subscription", async () => {
    const me = makeService();
    const firstOwner = await seedUser();
    const secondOwner = await seedUser();
    const candidateId = await seedCandidate();
    await link(firstOwner, candidateId);
    await link(secondOwner, candidateId);
    await addTelegramIdentity(firstOwner, "telegram-1");
    const retainedSubscription = await seedSubscription({
      userId: secondOwner,
      candidateId,
    });

    await expect(me.deleteAccount(firstOwner)).resolves.toBe(true);

    expect(await db.select().from(candidates)).toHaveLength(1);
    expect((await db.select().from(userCvs)).map((row) => row.userId)).toEqual([secondOwner]);
    expect((await db.select().from(subscriptions)).map((row) => row.id)).toEqual([
      retainedSubscription,
    ]);
  });

  it("does nothing when the account no longer exists", async () => {
    const me = makeService();
    const retainedSubscription = await seedSubscription({ chatId: "telegram-1" });

    await expect(me.deleteAccount("11111111-1111-1111-1111-111111111111")).resolves.toBe(false);

    expect((await db.select().from(subscriptions)).map((row) => row.id)).toEqual([
      retainedSubscription,
    ]);
  });
});

describe("MeService.deleteCv (integration)", () => {
  it("deletes the final owner's candidate and every associated CV subscription", async () => {
    const me = makeService();
    const userId = await seedUser();
    const candidateId = await seedCandidate();
    const linkId = await link(userId, candidateId);
    await db.insert(subscriptions).values({
      userId,
      candidateId,
      params: {},
      isActive: true,
    });

    await expect(me.deleteCv(userId, linkId)).resolves.toBe(true);
    expect(await db.select().from(userCvs)).toHaveLength(0);
    expect(await db.select().from(candidates)).toHaveLength(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });

  it("does not delete a CV link owned by another account", async () => {
    const me = makeService();
    const owner = await seedUser();
    const otherUser = await seedUser();
    const candidateId = await seedCandidate();
    const linkId = await link(owner, candidateId);

    await expect(me.deleteCv(otherUser, linkId)).resolves.toBe(false);
    expect(await db.select().from(candidates)).toHaveLength(1);
    expect(await db.select().from(userCvs)).toHaveLength(1);
  });

  it("keeps a legacy shared candidate until its final owner deletes it", async () => {
    const me = makeService();
    const firstOwner = await seedUser();
    const secondOwner = await seedUser();
    const candidateId = await seedCandidate();
    const firstLink = await link(firstOwner, candidateId);
    await link(secondOwner, candidateId);

    await expect(me.deleteCv(firstOwner, firstLink)).resolves.toBe(true);
    const owners = await db.select().from(userCvs).where(eq(userCvs.candidateId, candidateId));
    expect(owners).toHaveLength(1);
    expect(owners[0].userId).toBe(secondOwner);
    expect(await db.select().from(candidates).where(eq(candidates.id, candidateId))).toHaveLength(
      1,
    );
  });
});
