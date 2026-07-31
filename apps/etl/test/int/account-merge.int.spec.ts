import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { AuthService } from "../../src/platform/auth/auth.service";
import { verifyGoogleIdToken } from "../../src/platform/auth/google-verify";

import { makeTestDb } from "./db";

jest.mock("../../src/platform/auth/google-verify", () => ({
  verifyGoogleIdToken: jest.fn(),
}));
const verifyMock = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;

const { analyticsJourneys, authIdentities, subscriptions, users } = schema;
const TELEGRAM_ID = "555000111";
const JOURNEY_ID = "33333333-3333-3333-3333-333333333333";

let db: DrizzleDB;
let pool: Pool;
let auth: AuthService;

function makeAuth(): AuthService {
  const jwt = new JwtService({ secret: "int-test-secret", signOptions: { expiresIn: "30d" } });
  const config = {
    get: (key: string) =>
      key === "ADMIN_TELEGRAM_IDS" ? "" : key === "GOOGLE_CLIENT_ID" ? "test-client-id" : undefined,
  } as unknown as ConfigService;
  return new AuthService(db, jwt, config);
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  jest.clearAllMocks();
  auth = makeAuth();
  verifyMock.mockResolvedValue({
    sub: "google-source",
    email: "source@example.test",
    emailVerified: true,
    firstName: "Source",
  });
  await db.execute(
    sql`TRUNCATE TABLE account_merge_requests, product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE account_merge_requests, product_events, analytics_outbox, analytics_journeys, subscriptions, auth_identities, users RESTART IDENTITY CASCADE`,
  );
});

it("requires two sessions, then merges the source into the current account atomically", async () => {
  const source = await auth.loginGoogle("source-credential");
  const { userId: target } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
  await db.insert(analyticsJourneys).values({ id: JOURNEY_ID, personId: source.user.id });
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId: source.user.id, personId: source.user.id, journeyId: JOURNEY_ID, params: {} })
    .returning({ id: subscriptions.id });

  const { code } = await auth.startAccountMerge(source.user.id);
  expect(code).toMatch(/^(?:[A-F0-9]{4}-){3}[A-F0-9]{4}$/);
  await expect(auth.confirmAccountMerge(target, code)).resolves.toBeUndefined();

  await expect(auth.getMe(source.user.id)).resolves.toBeNull();
  await expect(auth.getMe(target)).resolves.toMatchObject({
    identities: expect.arrayContaining([
      expect.objectContaining({ provider: "google" }),
      expect.objectContaining({ provider: "telegram" }),
    ]),
  });
  await expect(
    db
      .select({ userId: subscriptions.userId, personId: subscriptions.personId })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id)),
  ).resolves.toEqual([{ userId: target, personId: target }]);
  await expect(
    db
      .select({ personId: analyticsJourneys.personId })
      .from(analyticsJourneys)
      .where(eq(analyticsJourneys.id, JOURNEY_ID)),
  ).resolves.toEqual([{ personId: target }]);
  await expect(auth.confirmAccountMerge(target, code)).rejects.toMatchObject({ status: 400 });
  await expect(db.select({ id: users.id }).from(users)).resolves.toHaveLength(1);
  await expect(db.select({ id: authIdentities.id }).from(authIdentities)).resolves.toHaveLength(2);
});

it("refuses to merge an account into itself", async () => {
  const source = await auth.loginGoogle("source-credential");
  const { code } = await auth.startAccountMerge(source.user.id);

  await expect(auth.confirmAccountMerge(source.user.id, code)).rejects.toMatchObject({
    status: 400,
  });
  await expect(auth.getMe(source.user.id)).resolves.toMatchObject({ id: source.user.id });
});
