import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";

import { schema, type DrizzleDB } from "@metahunt/database";

import { AuthService } from "../../src/platform/auth/auth.service";
import { TelegramLoginService } from "../../src/platform/auth/telegram-login.service";

import { makeTestDb } from "./db";

const { telegramLoginRequests, authIdentities, subscriptions } = schema;

const CHAT_ID = "555000111";
const OTHER_CHAT_ID = "555000222";

let db: DrizzleDB;
let pool: Pool;
let login: TelegramLoginService;

function makeLoginService(adminIds = ""): TelegramLoginService {
  const jwt = new JwtService({ secret: "int-test-secret", signOptions: { expiresIn: "30d" } });
  const config = {
    get: (key: string) => (key === "ADMIN_TELEGRAM_IDS" ? adminIds : undefined),
  } as unknown as ConfigService;
  return new TelegramLoginService(db, new AuthService(db, jwt, config));
}

// start() → the bot's describe() → confirm(), i.e. the whole handshake minus
// the browser poll.
async function startAndConfirm(chatId = CHAT_ID) {
  const started = await login.start();
  const described = await login.describe(started.startPayload);
  if (!described) throw new Error("expected a live login request");
  const result = await login.confirm(described.nonce, chatId, {});
  return { started, described, result };
}

beforeAll(() => {
  ({ db, pool } = makeTestDb());
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  login = makeLoginService();
});

afterEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE telegram_login_requests, auth_identities, subscriptions, users RESTART IDENTITY CASCADE`,
  );
});

describe("TelegramLoginService", () => {
  it("mints a session once the user confirms in the bot", async () => {
    const started = await login.start();

    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toEqual({
      status: "pending",
    });

    const described = await login.describe(started.startPayload);
    expect(described).toEqual({ nonce: started.nonce, verificationCode: started.verificationCode });
    await expect(
      login.confirm(started.nonce, CHAT_ID, { username: "tguser", firstName: "Tessa" }),
    ).resolves.toBe("authorized");

    const result = await login.poll(started.nonce, started.pollSecret);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.isNewUser).toBe(true);
    expect(result.user.telegramId).toBe(CHAT_ID);
    expect(result.user.username).toBe("tguser");
    expect(result.token).toEqual(expect.any(String));
  });

  it("keeps the deep-link payload inside Telegram's 64-char start limit", async () => {
    const started = await login.start();

    expect(started.startPayload.length).toBeLessThanOrEqual(64);
    expect(started.startPayload).toMatch(/^login_[A-Za-z0-9_-]+$/);
    expect(started.verificationCode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  // describe() is what the bot calls on /start. If it authorized anything, a
  // forwarded link would hand the tapper's account to whoever minted it.
  it("does not authorize anything when the bot merely inspects the link", async () => {
    const started = await login.start();

    await login.describe(started.startPayload);

    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toEqual({
      status: "pending",
    });
    await expect(db.select({ id: authIdentities.id }).from(authIdentities)).resolves.toEqual([]);
  });

  it("burns the request when the user declines", async () => {
    const started = await login.start();
    await login.describe(started.startPayload);

    await login.decline(started.nonce);

    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toEqual({
      status: "expired",
    });
    await expect(login.confirm(started.nonce, CHAT_ID, {})).resolves.toBe("invalid");
  });

  it("refuses a wrong poll secret while the request is still pending", async () => {
    const started = await login.start();

    // The wrong secret must not reveal that the nonce is live and waiting.
    await expect(login.poll(started.nonce, "not-the-secret")).resolves.toEqual({
      status: "expired",
    });
    await expect(login.poll("no-such-nonce", started.pollSecret)).resolves.toEqual({
      status: "expired",
    });
  });

  it("does not consume the request when the poll secret is wrong", async () => {
    const { started } = await startAndConfirm();

    await expect(login.poll(started.nonce, "not-the-secret")).resolves.toEqual({
      status: "expired",
    });
    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toMatchObject({
      status: "ready",
    });
  });

  it("is single-use — a replayed poll gets nothing", async () => {
    const { started } = await startAndConfirm();

    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toMatchObject({
      status: "ready",
    });
    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toEqual({
      status: "expired",
    });
  });

  it("hands one session to exactly one of two concurrent polls", async () => {
    const { started } = await startAndConfirm();

    const results = await Promise.all([
      login.poll(started.nonce, started.pollSecret),
      login.poll(started.nonce, started.pollSecret),
    ]);

    expect(results.filter((r) => r.status === "ready")).toHaveLength(1);
    expect(results.filter((r) => r.status === "expired")).toHaveLength(1);
  });

  it("lets only one chat win when two race the same nonce", async () => {
    const started = await login.start();

    const results = await Promise.all([
      login.confirm(started.nonce, CHAT_ID, {}),
      login.confirm(started.nonce, OTHER_CHAT_ID, {}),
    ]);

    expect(results.filter((r) => r === "authorized")).toHaveLength(1);
    expect(results.filter((r) => r === "already_authorized")).toHaveLength(1);
    // The loser must not have been upserted as a side effect of losing.
    const identities = await db
      .select({ providerUserId: authIdentities.providerUserId })
      .from(authIdentities);
    expect(identities).toHaveLength(1);
  });

  it("treats a re-confirmed link as already authorized instead of a second login", async () => {
    const { started, result } = await startAndConfirm();

    expect(result).toBe("authorized");
    await expect(login.confirm(started.nonce, CHAT_ID, {})).resolves.toBe("already_authorized");

    const identities = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.providerUserId, CHAT_ID));
    expect(identities).toHaveLength(1);
  });

  it("rejects an expired nonce at every step", async () => {
    const started = await login.start();
    await db
      .update(telegramLoginRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(telegramLoginRequests.nonce, started.nonce));

    await expect(login.describe(started.startPayload)).resolves.toBeNull();
    await expect(login.confirm(started.nonce, CHAT_ID, {})).resolves.toBe("invalid");
    await expect(login.poll(started.nonce, started.pollSecret)).resolves.toEqual({
      status: "expired",
    });
  });

  it("adopts the chat's orphan subscriptions on login", async () => {
    await db.insert(subscriptions).values({ chatId: CHAT_ID, params: {}, isActive: true });
    const { started } = await startAndConfirm();

    const result = await login.poll(started.nonce, started.pollSecret);

    if (result.status !== "ready") throw new Error("expected a session");
    const [claimed] = await db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(eq(subscriptions.chatId, CHAT_ID));
    expect(claimed.userId).toBe(result.user.id);
  });

  it("grants admin from ADMIN_TELEGRAM_IDS", async () => {
    login = makeLoginService(CHAT_ID);
    const { started } = await startAndConfirm();

    const result = await login.poll(started.nonce, started.pollSecret);

    if (result.status !== "ready") throw new Error("expected a session");
    expect(result.user.roles).toEqual(["user", "admin"]);
  });

  it("purges only expired requests", async () => {
    const live = await login.start();
    const stale = await login.start();
    await db
      .update(telegramLoginRequests)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(telegramLoginRequests.nonce, stale.nonce));

    await expect(login.purgeExpired()).resolves.toBe(1);
    const remaining = await db
      .select({ nonce: telegramLoginRequests.nonce })
      .from(telegramLoginRequests);
    expect(remaining).toEqual([{ nonce: live.nonce }]);
  });
});
