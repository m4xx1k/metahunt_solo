import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { NodeSlugResolver } from "../../src/platform/nodes/node-slug.resolver";
import { SubscriptionsService } from "../../src/04-notify/telegram/subscriptions.service";

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
  await db.execute(sql`TRUNCATE TABLE sent_notifications, subscriptions RESTART IDENTITY CASCADE`);
  await truncateAll(db);
});

describe("SubscriptionsService.linkChat", () => {
  it("activates a pending token once when Telegram retries the same update", async () => {
    const [pending] = await db
      .insert(subscriptions)
      .values({ params: {} })
      .returning({ id: subscriptions.id });
    const analytics = { telegramLinked: jest.fn() };
    const service = new SubscriptionsService(db, analytics as never, new NodeSlugResolver(db));

    const results = await Promise.all([
      service.linkChat(pending.id, "fixture-chat"),
      service.linkChat(pending.id, "fixture-chat"),
    ]);

    expect(results.sort()).toEqual(["already_active", "linked"]);
    expect(analytics.telegramLinked).toHaveBeenCalledTimes(1);
    await expect(
      db
        .select({ chatId: subscriptions.chatId, isActive: subscriptions.isActive })
        .from(subscriptions)
        .where(eq(subscriptions.id, pending.id)),
    ).resolves.toEqual([{ chatId: "fixture-chat", isActive: true }]);
  });
});
