import { and, eq, inArray, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";
import { SubscriptionCriteriaService } from "../../src/platform/subscriptions/subscription-criteria.service";
import { SubscriptionsService } from "../../src/04-notify/telegram/subscriptions.service";

import { dormantPostHog, noopAnalytics } from "./analytics";
import { makeTestDb, truncateAll } from "./db";

const { subscriptions } = schema;

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
    sql`TRUNCATE TABLE sent_notifications, subscriptions, analytics_outbox, analytics_journeys RESTART IDENTITY CASCADE`,
  );
  await truncateAll(db);
});

// Pending rows are always account-owned now, and linkChat refuses a token whose
// owner does not match the chat's account — so every fixture needs a real user.
async function seedOwner(): Promise<string> {
  const [user] = await db
    .insert(schema.users)
    .values({ source: "test" })
    .returning({ id: schema.users.id });
  return user.id;
}

describe("SubscriptionsService.linkChat", () => {
  it("activates a pending token once when Telegram retries the same update", async () => {
    const owner = await seedOwner();
    const [pending] = await db
      .insert(subscriptions)
      .values({ params: {}, userId: owner })
      .returning({ id: subscriptions.id });
    const analytics = { telegramLinked: jest.fn() };
    const service = new SubscriptionsService(
      db,
      analytics as never,
      dormantPostHog(),
      new SubscriptionCriteriaService(db, new NodeSlugResolver(db)),
    );

    const results = await Promise.all([
      service.linkChat(pending.id, "fixture-chat", { userId: owner }),
      service.linkChat(pending.id, "fixture-chat", { userId: owner }),
    ]);

    // No analytics assertion: the ledger's telegramLinked is gated behind
    // `!productAnalytics.isEnabled()`, which is now permanently false, and the
    // v2 contract has no telegram_linked event. The race is the subject here.
    expect(results.sort()).toEqual(["already_active", "linked"]);
    await expect(
      db
        .select({ chatId: subscriptions.chatId, isActive: subscriptions.isActive })
        .from(subscriptions)
        .where(eq(subscriptions.id, pending.id)),
    ).resolves.toEqual([{ chatId: "fixture-chat", isActive: true }]);
  });

  it("keeps one active subscription when equivalent pending tokens race", async () => {
    const owner = await seedOwner();
    const pending = await db
      .insert(subscriptions)
      .values([
        { params: { seniorities: ["MIDDLE"] }, userId: owner },
        { params: { seniorities: ["MIDDLE"] }, userId: owner },
      ])
      .returning({ id: subscriptions.id });
    const analytics = { telegramLinked: jest.fn() };
    const service = new SubscriptionsService(
      db,
      analytics as never,
      dormantPostHog(),
      new SubscriptionCriteriaService(db, new NodeSlugResolver(db)),
    );

    const results = await Promise.all(
      pending.map((sub) => service.linkChat(sub.id, "fixture-chat", { userId: owner })),
    );

    expect(results.sort()).toEqual(["duplicate", "linked"]);
    await expect(
      db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.chatId, "fixture-chat"), eq(subscriptions.isActive, true))),
    ).resolves.toHaveLength(1);
  });
});

describe("SubscriptionsService.create", () => {
  it("stores each subscription's match criteria independently", async () => {
    const nodes = await db
      .insert(schema.nodes)
      .values([
        { type: "ROLE", canonicalName: "Backend", slug: "backend", status: "VERIFIED" },
        { type: "SKILL", canonicalName: "PHP", slug: "php", status: "VERIFIED" },
        { type: "SKILL", canonicalName: "Go", slug: "go", status: "VERIFIED" },
      ])
      .returning({ id: schema.nodes.id, slug: schema.nodes.slug });
    const bySlug = new Map(nodes.map((node) => [node.slug, node.id]));
    const service = new SubscriptionsService(
      db,
      noopAnalytics(db),
      dormantPostHog(),
      new SubscriptionCriteriaService(db, new NodeSlugResolver(db)),
    );

    const owner = await seedOwner();
    const firstId = await service.create(
      { roleIds: ["backend"], excludedSkillIds: ["php"] },
      { userId: owner },
    );
    const secondId = await service.create(
      { roleIds: ["backend"], excludedSkillIds: ["go"] },
      { userId: owner },
    );
    const rows = await db
      .select({ id: subscriptions.id, params: subscriptions.params })
      .from(subscriptions)
      .where(inArray(subscriptions.id, [firstId, secondId]));
    const byId = new Map(rows.map((row) => [row.id, row.params]));

    expect(byId.get(firstId)).toMatchObject({
      roleIds: [bySlug.get("backend")],
      excludedSkillIds: [bySlug.get("php")],
    });
    expect(byId.get(secondId)).toMatchObject({
      roleIds: [bySlug.get("backend")],
      excludedSkillIds: [bySlug.get("go")],
    });
  });
});
