import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE, schema, type DrizzleDB } from "@metahunt/database";

import { AnalyticsPageService } from "../../src/admin/analytics-page/analytics-page.service";
import { PostHogQueryClient } from "../../src/platform/analytics/posthog-query.client";
import { makeTestDb } from "./db";

const { subscriptions, users } = schema;
const ACCOUNT_ID = "11111111-1111-1111-1111-111111111111";
const UNLINKED_PERSON_ID = "22222222-2222-2222-2222-222222222222";

let db: DrizzleDB;
let pool: Pool;
let service: AnalyticsPageService;

beforeAll(async () => {
  ({ db, pool } = makeTestDb());
  const moduleRef = await Test.createTestingModule({
    providers: [
      AnalyticsPageService,
      { provide: DRIZZLE, useValue: db },
      { provide: PostHogQueryClient, useValue: { isAvailable: () => false } },
    ],
  }).compile();
  service = moduleRef.get(AnalyticsPageService);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

// The roster is `FROM users u` — an account is the only thing that is a person.
// A chat-only subscription is not yet one and must not manufacture a row.
it("rosters accounts only, and retains total beyond its final page", async () => {
  await db
    .insert(users)
    .values({ id: ACCOUNT_ID, email: "owner@example.test", source: "google-login" });
  await db.insert(subscriptions).values({
    personId: UNLINKED_PERSON_ID,
    chatId: "private-chat",
    params: {},
    isActive: true,
  });

  await expect(
    service.people({ period: "30d", limit: 50, offset: 0, sort: "displayName", dir: "asc" }),
  ).resolves.toMatchObject({
    total: 1,
    rows: [expect.objectContaining({ userId: ACCOUNT_ID, email: "owner@example.test" })],
  });

  await expect(
    service.people({ period: "30d", limit: 50, offset: 50, sort: "displayName", dir: "asc" }),
  ).resolves.toMatchObject({ total: 1, rows: [] });
});
