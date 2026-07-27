import { createHash, createHmac } from "node:crypto";

import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { AuthService } from "../../src/platform/auth/auth.service";
import { verifyGoogleIdToken } from "../../src/platform/auth/google-verify";
import type { TelegramAuthPayload } from "../../src/platform/auth/telegram-verify";

import { makeTestDb } from "./db";

// Google's half of the handshake is covered by google-verify.spec.ts; what
// needs a real database is what we do with a verified profile.
jest.mock("../../src/platform/auth/google-verify", () => ({
  verifyGoogleIdToken: jest.fn(),
}));
const verifyMock = verifyGoogleIdToken as jest.MockedFunction<typeof verifyGoogleIdToken>;

const { users, authIdentities, subscriptions } = schema;

const GOOGLE_SUB = "google-sub-1";
const TELEGRAM_ID = "555000111";
const EMAIL = "candidate@example.test";

let db: DrizzleDB;
let pool: Pool;
let auth: AuthService;

function makeAuth(adminIds = ""): AuthService {
  const jwt = new JwtService({ secret: "int-test-secret", signOptions: { expiresIn: "30d" } });
  const config = {
    get: (key: string) =>
      key === "ADMIN_TELEGRAM_IDS"
        ? adminIds
        : key === "GOOGLE_CLIENT_ID"
          ? "test-client-id"
          : key === "TELEGRAM_BOT_TOKEN"
            ? "test-bot-token"
            : undefined,
  } as unknown as ConfigService;
  return new AuthService(db, jwt, config);
}

// Real HMAC against the same bot token the service reads — linkTelegramTo runs
// the production verifier, so a fake hash would be rejected.
function signedTelegramPayload(): TelegramAuthPayload {
  const fields: Record<string, unknown> = {
    id: Number(TELEGRAM_ID),
    auth_date: Math.floor(Date.now() / 1000),
    username: "tguser",
    first_name: "Tessa",
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join("\n");
  const secret = createHash("sha256").update("test-bot-token").digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return { ...fields, hash } as TelegramAuthPayload;
}

function googleProfile(over: Partial<{ email: string | null; emailVerified: boolean }> = {}) {
  verifyMock.mockResolvedValue({
    sub: GOOGLE_SUB,
    email: over.email === undefined ? EMAIL : over.email,
    emailVerified: over.emailVerified ?? true,
    firstName: "Ada",
  });
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  jest.clearAllMocks();
  auth = makeAuth();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE telegram_login_requests, auth_identities, subscriptions, users RESTART IDENTITY CASCADE`,
  );
});

describe("Google sign-in", () => {
  it("creates an account on the first login and reuses it on the second", async () => {
    googleProfile();

    const first = await auth.loginGoogle("credential");
    expect(first.isNewUser).toBe(true);
    expect(first.user.email).toBe(EMAIL);
    expect(first.user.telegramId).toBeNull();
    expect(first.user.identities).toEqual([
      expect.objectContaining({ provider: "google", firstName: "Ada" }),
    ]);

    const second = await auth.loginGoogle("credential");
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
    await expect(db.select({ id: users.id }).from(users)).resolves.toHaveLength(1);
  });

  it("adopts a waitlist row that already holds the verified email", async () => {
    const [waitlisted] = await db
      .insert(users)
      .values({ email: EMAIL, source: "waitlist" })
      .returning({ id: users.id });
    googleProfile();

    const session = await auth.loginGoogle("credential");

    expect(session.user.id).toBe(waitlisted.id);
    // Adoption, not signup — the person was already known to us.
    expect(session.isNewUser).toBe(false);
    await expect(db.select({ id: users.id }).from(users)).resolves.toHaveLength(1);
  });

  it("never adopts on an unverified email, and never stores one", async () => {
    await db.insert(users).values({ email: EMAIL, source: "waitlist" });
    googleProfile({ emailVerified: false });

    const session = await auth.loginGoogle("credential");

    expect(session.user.email).toBeNull();
    await expect(db.select({ id: users.id }).from(users)).resolves.toHaveLength(2);
  });

  it("matches a waitlist row that was stored in a different case", async () => {
    const [waitlisted] = await db
      .insert(users)
      .values({ email: EMAIL, source: "waitlist" })
      .returning({ id: users.id });
    googleProfile({ email: EMAIL.toUpperCase() });

    await expect(auth.loginGoogle("credential")).resolves.toMatchObject({
      user: { id: waitlisted.id },
    });
  });

  // The adoption rule is only safe while an email can reach nothing but an
  // ownerless row. Reassign a Workspace address and this is the takeover.
  it("refuses to adopt an account that already has an identity", async () => {
    googleProfile();
    const victim = await auth.loginGoogle("credential");
    verifyMock.mockResolvedValue({
      sub: "different-google-sub",
      email: EMAIL,
      emailVerified: true,
      firstName: "Mallory",
    });

    const attacker = await auth.loginGoogle("credential");

    expect(attacker.user.id).not.toBe(victim.user.id);
    await expect(db.select({ id: users.id }).from(users)).resolves.toHaveLength(2);
  });

  it("keeps the provider email off users, so it can never key an adoption", async () => {
    googleProfile();
    const session = await auth.loginGoogle("credential");

    expect(session.user.email).toBe(EMAIL);
    const [row] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id));
    expect(row.email).toBeNull();
  });

  it("revokes admin once the Telegram identity that granted it is gone", async () => {
    auth = makeAuth(TELEGRAM_ID);
    const { userId } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
    googleProfile();
    await auth.linkGoogleTo(userId, "credential");
    await expect(auth.getMe(userId)).resolves.toMatchObject({ roles: ["user", "admin"] });

    await auth.unlinkIdentity(userId, "telegram");

    // Grant-without-revoke would leave an ex-admin permanently privileged and
    // unreachable by an ADMIN_TELEGRAM_IDS edit.
    await expect(auth.getMe(userId)).resolves.toMatchObject({ roles: ["user"] });
  });

  it("does not touch roles — signing in with Google must not demote an admin", async () => {
    auth = makeAuth(TELEGRAM_ID);
    const { userId } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
    googleProfile();
    await auth.linkGoogleTo(userId, "credential");

    const session = await auth.loginGoogle("credential");

    expect(session.user.id).toBe(userId);
    expect(session.user.roles).toEqual(["user", "admin"]);
  });
});

describe("linking", () => {
  it("puts both providers on one account and reports them on /auth/me", async () => {
    const { userId } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
    googleProfile();

    await auth.linkGoogleTo(userId, "credential");

    const me = await auth.getMe(userId);
    expect(me?.identities.map((i) => i.provider).sort()).toEqual(["google", "telegram"]);
    // The header chip keeps reading the Telegram handle when both are present.
    expect(me?.username).toBe("tguser");
    expect(me?.email).toBe(EMAIL);
  });

  it("refuses to steal an identity that belongs to another account", async () => {
    googleProfile();
    const owner = await auth.loginGoogle("credential");
    const { userId: other } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");

    await expect(auth.linkGoogleTo(other, "credential")).rejects.toMatchObject({ status: 409 });

    const me = await auth.getMe(other);
    expect(me?.identities).toHaveLength(1);
    await expect(auth.getMe(owner.user.id)).resolves.toMatchObject({ id: owner.user.id });
  });

  it("is idempotent when relinking the account you already have", async () => {
    googleProfile();
    const session = await auth.loginGoogle("credential");

    await expect(auth.linkGoogleTo(session.user.id, "credential")).resolves.toBeUndefined();

    const me = await auth.getMe(session.user.id);
    expect(me?.identities).toHaveLength(1);
  });

  it("adopts the chat's orphan subscriptions when Telegram is linked second", async () => {
    googleProfile();
    const session = await auth.loginGoogle("credential");
    await db.insert(subscriptions).values({ chatId: TELEGRAM_ID, params: {}, isActive: true });

    await auth.linkTelegramTo(session.user.id, signedTelegramPayload());

    const [claimed] = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.chatId, TELEGRAM_ID));
    expect(claimed.userId).toBe(session.user.id);
  });

  it("survives two unlinks racing for the last identity", async () => {
    const { userId } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
    googleProfile();
    await auth.linkGoogleTo(userId, "credential");

    // Both see two identities; only one may win, or the account is stranded.
    const results = await Promise.allSettled([
      auth.unlinkIdentity(userId, "telegram"),
      auth.unlinkIdentity(userId, "google"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const left = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
    expect(left).toHaveLength(1);
  });

  it("unlinks a provider but never the last one", async () => {
    const { userId } = await auth.resolveTelegramUser(TELEGRAM_ID, "tguser", "Tessa");
    googleProfile();
    await auth.linkGoogleTo(userId, "credential");

    await auth.unlinkIdentity(userId, "google");
    await expect(db.select({ id: authIdentities.id }).from(authIdentities)).resolves.toHaveLength(
      1,
    );

    // Dropping the only remaining method would lock the account out of itself.
    await expect(auth.unlinkIdentity(userId, "telegram")).rejects.toMatchObject({ status: 400 });
    await expect(auth.unlinkIdentity(userId, "google")).rejects.toMatchObject({ status: 404 });
  });
});
