import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { FeedService } from "../../src/03-discovery/feed/feed.service";
import { AlertCandidatesRepository } from "../../src/04-notify/alerts/alert-candidates.repository";
import { AlertLedgerRepository } from "../../src/04-notify/alerts/alert-ledger.repository";
import { AlertsService } from "../../src/04-notify/alerts/alerts.service";
import { SentNotificationsService } from "../../src/04-notify/telegram/sent-notifications.service";
import { SubscriptionsService } from "../../src/04-notify/telegram/subscriptions.service";
import { MeService } from "../../src/account/me.service";
import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";
import { SubscriptionCriteriaService } from "../../src/platform/subscriptions/subscription-criteria.service";

import { dormantPostHog, noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";
import { insertVacancyWithGroup, mergeIntoGroup } from "./vacancy-fixture";

const { chatNotifications, sentNotifications, subscriptions, vacancies } = schema;
const HOUR = 3_600_000;
const CHAT = "chat-owner";

let db: DrizzleDB;
let pool: Pool;
let seq = 0;
let roleId: string;

interface Sent {
  chatId: string;
  html: string;
  silent: boolean;
}

class FakeTelegram {
  readonly sent: Sent[] = [];
  readonly failures: Error[] = [];
  delayMs = 0;

  canSendTo(): boolean {
    return true;
  }

  async sendMessage(
    chatId: string,
    html: string,
    opts: { disableNotification?: boolean } = {},
  ): Promise<number> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.sent.push({ chatId, html, silent: opts.disableNotification === true });
    return this.sent.length;
  }
}

const T0 = Date.now();
const ago = (hours: number): Date => new Date(T0 - hours * HOUR);

function subscriptionsService(): SubscriptionsService {
  return new SubscriptionsService(
    db,
    { subscriptionCreated: jest.fn() } as never,
    dormantPostHog(),
    new SubscriptionCriteriaService(db, new NodeSlugResolver(db)),
  );
}

function makeAlerts(telegram: FakeTelegram): AlertsService {
  const urls: Record<string, string> = {
    PUBLIC_BASE_URL: "https://api.test",
    WEB_BASE_URL: "https://web.test",
  };
  return new AlertsService(
    { get: (key: string) => urls[key] } as never,
    subscriptionsService(),
    new AlertCandidatesRepository(db, new FeedService(db)),
    new AlertLedgerRepository(db),
    new SentNotificationsService(db, noopAnalytics(db), dormantPostHog()),
    telegram as never,
  );
}

async function seedSource(code = `src-${++seq}`): Promise<{ sourceId: string; ingestId: string }> {
  const [source] = await db
    .insert(schema.sources)
    .values({ code, displayName: code.toUpperCase(), baseUrl: "https://example.test" })
    .returning({ id: schema.sources.id });
  const [ingest] = await db
    .insert(schema.rssIngests)
    .values({ sourceId: source.id, triggeredBy: "test", startedAt: new Date() })
    .returning({ id: schema.rssIngests.id });
  return { sourceId: source.id, ingestId: ingest.id };
}

async function seedPosting(
  source: { sourceId: string; ingestId: string },
  publishedAt: Date,
  loadedAt = publishedAt,
): Promise<string> {
  const externalId = `ext-${++seq}`;
  const [record] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: source.sourceId,
      rssIngestId: source.ingestId,
      externalId,
      hash: `hash-${externalId}`,
      title: "Backend Engineer",
      publishedAt,
      link: `https://example.test/${externalId}`,
      createdAt: loadedAt,
    })
    .returning({ id: schema.rssRecords.id });
  return insertVacancyWithGroup(db, {
    sourceId: source.sourceId,
    externalId,
    lastRssRecordId: record.id,
    title: "Backend Engineer",
    roleNodeId: roleId,
    publishedAt,
    loadedAt,
    deduplicatedAt: loadedAt,
  });
}

// What a source bump does to a posting (§7): a newer record, the row updated in place.
async function bump(vacancyId: string, publishedAt: Date): Promise<void> {
  const [v] = await db.select().from(vacancies).where(eq(vacancies.id, vacancyId));
  const [record] = await db
    .insert(schema.rssRecords)
    .values({
      sourceId: v.sourceId,
      rssIngestId: (
        await db.select({ id: schema.rssIngests.id }).from(schema.rssIngests).limit(1)
      )[0].id,
      externalId: v.externalId,
      hash: `bump-${++seq}`,
      title: "Backend Engineer",
      publishedAt,
      link: `https://example.test/${v.externalId}`,
    })
    .returning({ id: schema.rssRecords.id });
  await db
    .update(vacancies)
    .set({ publishedAt, lastRssRecordId: record.id, deduplicatedAt: new Date() })
    .where(eq(vacancies.id, vacancyId));
}

async function seedSubscription(
  over: Partial<typeof subscriptions.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      chatId: CHAT,
      params: {},
      isActive: true,
      createdAt: ago(100),
      alertsFloorAt: ago(48),
      ...over,
    })
    .returning({ id: subscriptions.id });
  return row.id;
}

async function ledger(chatId = CHAT) {
  return db.select().from(chatNotifications).where(eq(chatNotifications.chatId, chatId));
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  const [role] = await db
    .insert(schema.nodes)
    .values({ type: "ROLE", canonicalName: `Backend Developer ${++seq}`, status: "VERIFIED" })
    .returning({ id: schema.nodes.id });
  roleId = role.id;
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE chat_notifications, sent_notifications, subscriptions RESTART IDENTITY CASCADE`,
  );
  await truncateAll(db);
});

describe("AlertsService.deliverChat (integration)", () => {
  it("sends every new posting once, then nothing on a repeat run, and dual-writes v1's ledger", async () => {
    const sub = await seedSubscription();
    const source = await seedSource();
    const a = await seedPosting(source, ago(3));
    const b = await seedPosting(source, ago(2));
    const telegram = new FakeTelegram();
    const alerts = makeAlerts(telegram);

    const first = await alerts.deliverChat(CHAT);
    expect(first).toMatchObject({ candidates: 2, sent: 2, bumped: 0 });
    expect(telegram.sent.map((m) => m.html.includes(a))).toEqual([true, false]);
    expect(telegram.sent.map((m) => m.silent)).toEqual([false, true]);

    const second = await alerts.deliverChat(CHAT);
    expect(second).toMatchObject({ sent: 0, skipped: 2 });
    expect(telegram.sent).toHaveLength(2);

    const v1 = await db.select().from(sentNotifications);
    expect(v1.map((r) => [r.subscriptionId, r.vacancyId]).sort()).toEqual(
      [
        [sub, a],
        [sub, b],
      ].sort(),
    );
  });

  it("sends a bump with the marker and absorbs a second one within 24h", async () => {
    await seedSubscription();
    const source = await seedSource();
    const posting = await seedPosting(source, ago(40), ago(40));
    await db.insert(chatNotifications).values({
      chatId: CHAT,
      vacancyId: posting,
      versionAt: ago(40),
      notifiedAt: ago(39),
      kind: "new",
    });
    const telegram = new FakeTelegram();
    const alerts = makeAlerts(telegram);

    await bump(posting, ago(2));
    expect(await alerts.deliverChat(CHAT)).toMatchObject({ sent: 1, bumped: 1 });
    expect(telegram.sent[0].html).toContain(" · 🔄 оновлено");

    await bump(posting, ago(1));
    expect(await alerts.deliverChat(CHAT)).toMatchObject({ sent: 0, absorbed: 1 });
    const [row] = await ledger();
    expect(row).toMatchObject({ kind: "absorbed", versionAt: ago(1) });
  });

  it("collapses a cross-site copy of a posting the chat already got", async () => {
    await seedSubscription();
    const djinni = await seedSource("djinni");
    const dou = await seedSource("dou");
    const sentPosting = await seedPosting(djinni, ago(10));
    const copy = await seedPosting(dou, ago(2));
    await mergeIntoGroup(db, [sentPosting, copy]);
    await db.insert(chatNotifications).values({
      chatId: CHAT,
      vacancyId: sentPosting,
      versionAt: ago(10),
      notifiedAt: ago(9),
      kind: "new",
    });
    const telegram = new FakeTelegram();

    expect(await makeAlerts(telegram).deliverChat(CHAT)).toMatchObject({
      sent: 0,
      collapsed: 1,
    });
    expect(telegram.sent).toHaveLength(0);
    const rows = await ledger();
    expect(rows.find((r) => r.vacancyId === copy)).toMatchObject({
      kind: "collapsed",
      notifiedAt: null,
    });
  });

  it("two subscriptions in one chat → each posting once; the ledger is per chat", async () => {
    await seedSubscription();
    await seedSubscription({ params: { includeRoleless: true } });
    await seedSubscription({ chatId: "chat-tester" });
    const source = await seedSource();
    await seedPosting(source, ago(2));
    const telegram = new FakeTelegram();
    const alerts = makeAlerts(telegram);

    expect(await alerts.deliverChat(CHAT)).toMatchObject({ candidates: 1, sent: 1 });
    expect(await alerts.deliverChat("chat-tester")).toMatchObject({ sent: 1 });
    expect(telegram.sent.map((m) => m.chatId)).toEqual([CHAT, "chat-tester"]);
  });

  it("claim race: two runs on one chat in parallel deliver each card once", async () => {
    await seedSubscription();
    const source = await seedSource();
    for (let i = 0; i < 5; i++) await seedPosting(source, ago(5 - i * 0.5));
    const telegram = new FakeTelegram();
    telegram.delayMs = 5;
    const alerts = makeAlerts(telegram);

    const [one, two] = await Promise.all([alerts.deliverChat(CHAT), alerts.deliverChat(CHAT)]);

    expect(one.sent + two.sent).toBe(5);
    expect(new Set(telegram.sent.map((m) => m.html)).size).toBe(5);
  });

  it("lazy init: floor set, v1 ledger copied, CV retired, legacy messages, zero cards", async () => {
    const filterSub = await seedSubscription({ alertsFloorAt: null, userId: null });
    const cvSub = await seedSubscription({ alertsFloorAt: null, candidateId: randomUUID() });
    const source = await seedSource();
    const old = await seedPosting(source, ago(30));
    await seedPosting(source, ago(2));
    await db.insert(sentNotifications).values({
      subscriptionId: filterSub,
      vacancyId: old,
      sentAt: ago(29),
    });
    const telegram = new FakeTelegram();

    const result = await makeAlerts(telegram).deliverChat(CHAT);

    expect(result).toMatchObject({ sent: 0, legacy: 2, candidates: 0 });
    expect(telegram.sent.map((m) => m.html)).toEqual([
      "CV-підписку вимкнено. Фільтр — на сайті: https://web.test",
      "Керуй сповіщеннями на сайті: https://web.test/me",
    ]);
    expect(telegram.sent.map((m) => m.silent)).toEqual([false, true]);

    const subs = await db.select().from(subscriptions);
    expect(subs.every((s) => s.alertsFloorAt !== null)).toBe(true);
    expect(subs.find((s) => s.id === cvSub)).toMatchObject({
      isActive: false,
      deactivatedReason: "retired",
    });
    expect(await ledger()).toEqual([
      expect.objectContaining({ vacancyId: old, kind: "new", notifiedAt: ago(29) }),
    ]);

    // The floor is now: the posting from 2h ago predates it and never arrives.
    expect(await makeAlerts(telegram).deliverChat(CHAT)).toMatchObject({
      candidates: 0,
      legacy: 0,
    });
  });

  it("a Telegram refusal undoes the claim; a timeout keeps it", async () => {
    await seedSubscription();
    const source = await seedSource();
    const refused = await seedPosting(source, ago(3));
    const timedOut = await seedPosting(source, ago(2));
    const telegram = new FakeTelegram();
    const timeout = Object.assign(new Error("socket hang up"), { code: "ETIMEDOUT" });
    telegram.failures.push(Object.assign(new Error("Bad Request"), { error_code: 400 }), timeout);
    const alerts = makeAlerts(telegram);

    await expect(alerts.deliverChat(CHAT)).rejects.toBe(timeout);

    const rows = await ledger();
    expect(rows.map((r) => r.vacancyId)).toEqual([timedOut]);
    expect(rows.find((r) => r.vacancyId === refused)).toBeUndefined();

    expect(await alerts.deliverChat(CHAT)).toMatchObject({ sent: 1, skipped: 1 });
    expect(telegram.sent.map((m) => m.html.includes(refused))).toEqual([true]);
  });

  it("delivers 200 matches in one run: all of them, oldest first, one audible", async () => {
    await seedSubscription();
    const source = await seedSource();
    const ids: string[] = [];
    for (let i = 0; i < 200; i++) ids.push(await seedPosting(source, ago(20 - i * 0.05)));
    const telegram = new FakeTelegram();

    expect(await makeAlerts(telegram).deliverChat(CHAT)).toMatchObject({
      candidates: 200,
      sent: 200,
    });
    expect(telegram.sent.map((m) => ids.findIndex((id) => m.html.includes(id)))).toEqual(
      ids.map((_, i) => i),
    );
    expect(telegram.sent.filter((m) => !m.silent)).toHaveLength(1);
  });

  it("account deletion removes the chat's ledger rows", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ source: "test" })
      .returning({ id: schema.users.id });
    await db.insert(schema.authIdentities).values({
      userId: user.id,
      provider: "telegram",
      providerUserId: CHAT,
    });
    await seedSubscription({ userId: user.id });
    const source = await seedSource();
    await seedPosting(source, ago(2));
    await makeAlerts(new FakeTelegram()).deliverChat(CHAT);
    await db.insert(chatNotifications).values({
      chatId: "chat-other",
      vacancyId: (await db.select().from(vacancies))[0].id,
      versionAt: ago(2),
      kind: "new",
    });
    expect(await ledger()).toHaveLength(1);

    const me = new MeService(
      db,
      new SubscriptionCriteriaService(db, new NodeSlugResolver(db)),
      noopAnalytics(db),
      dormantPostHog(),
    );
    await expect(me.deleteAccount(user.id)).resolves.toBe(true);

    expect(await ledger()).toHaveLength(0);
    expect(await ledger("chat-other")).toHaveLength(1);
  });
});
