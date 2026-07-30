import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { TelegramLoginPollResponse, TelegramLoginStartResponse } from "./auth.contract";
import { AuthService } from "./auth.service";

const { telegramLoginRequests } = schema;

// Telegram caps the `/start` payload at 64 chars, so the nonce stays short.
const START_PREFIX = "login_";
const NONCE_BYTES = 16;
const POLL_SECRET_BYTES = 32;
const TTL_MS = 5 * 60_000;
// No 0/O/1/I — this gets read off one screen and compared against another.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export type TelegramLoginConfirmResult =
  "authorized" | "already_authorized" | "identity_conflict" | "invalid";

export function isLoginStartPayload(payload: string): boolean {
  return payload.startsWith(START_PREFIX);
}

function hash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function secretMatches(candidate: string, expectedHash: string): boolean {
  const a = Buffer.from(hash(candidate), "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verificationCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Telegram login without a browser widget, guarded on two sides: the poll secret
 * never leaves the originating browser, and confirmation in the bot is explicit
 * and code-matched — so a forwarded link cannot hand the tapper's account to
 * whoever minted it.
 */
@Injectable()
export class TelegramLoginService {
  private readonly logger = new Logger(TelegramLoginService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async start(linkUserId?: string): Promise<TelegramLoginStartResponse> {
    if (!(this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "")) {
      throw new ServiceUnavailableException("Telegram login is not configured");
    }
    const nonce = randomBytes(NONCE_BYTES).toString("base64url");
    const pollSecret = randomBytes(POLL_SECRET_BYTES).toString("base64url");
    const code = verificationCode();

    await this.db.insert(telegramLoginRequests).values({
      nonce,
      pollSecretHash: hash(pollSecret),
      verificationCode: code,
      linkUserId,
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    return { nonce, pollSecret, verificationCode: code, startPayload: `${START_PREFIX}${nonce}` };
  }

  // Deliberately side-effect free: pressing START must not authorize a login.
  async describe(
    startPayload: string,
  ): Promise<{ nonce: string; verificationCode: string; mode: "login" | "link" } | null> {
    if (!isLoginStartPayload(startPayload)) return null;
    const nonce = startPayload.slice(START_PREFIX.length);
    if (nonce.length === 0) return null;

    const [row] = await this.db
      .select({
        verificationCode: telegramLoginRequests.verificationCode,
        linkUserId: telegramLoginRequests.linkUserId,
      })
      .from(telegramLoginRequests)
      .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()));
    return row
      ? {
          nonce,
          verificationCode: row.verificationCode,
          mode: row.linkUserId === null ? "login" : "link",
        }
      : null;
  }

  // `chatId` comes off a Bot API update, so it needs no HMAC. The row is locked
  // for the whole sequence: two chats racing one nonce must not both upsert.
  async confirm(
    nonce: string,
    chatId: string,
    profile: { username?: string; firstName?: string },
  ): Promise<TelegramLoginConfirmResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          userId: telegramLoginRequests.userId,
          linkUserId: telegramLoginRequests.linkUserId,
          failure: telegramLoginRequests.failure,
        })
        .from(telegramLoginRequests)
        .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()))
        .for("update");
      if (!row) return "invalid";
      if (row.userId !== null) return "already_authorized";
      if (row.failure === "identity_conflict") return "identity_conflict";

      let userId: string;
      let created: boolean;
      try {
        if (row.linkUserId !== null) {
          userId = row.linkUserId;
          created = false;
          await this.auth.linkTrustedTelegramUser(
            userId,
            chatId,
            { username: profile.username ?? null, firstName: profile.firstName ?? null },
            tx,
          );
        } else {
          const resolved = await this.auth.resolveTelegramUser(
            chatId,
            profile.username ?? null,
            profile.firstName ?? null,
            tx,
          );
          userId = resolved.userId;
          created = resolved.created;
        }
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        await tx
          .update(telegramLoginRequests)
          .set({ failure: "identity_conflict" })
          .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()));
        return "identity_conflict";
      }
      await tx
        .update(telegramLoginRequests)
        .set({ userId, isNewUser: created })
        .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()));

      this.logger.log(
        `telegram deep-link ${row.linkUserId === null ? "login" : "link"} confirmed for user ${userId} new=${created}`,
      );
      return "authorized";
    });
  }

  /** "Not me" — burn the request so the poller gets nothing. */
  async decline(nonce: string): Promise<void> {
    await this.db
      .delete(telegramLoginRequests)
      .where(and(eq(telegramLoginRequests.nonce, nonce), isNull(telegramLoginRequests.userId)));
  }

  // Authenticate before revealing state, and reveal state before consuming —
  // that ordering is what keeps this from being a nonce oracle.
  async poll(nonce: string, pollSecret: string): Promise<TelegramLoginPollResponse> {
    const [row] = await this.db
      .select({
        pollSecretHash: telegramLoginRequests.pollSecretHash,
        userId: telegramLoginRequests.userId,
        isNewUser: telegramLoginRequests.isNewUser,
        failure: telegramLoginRequests.failure,
      })
      .from(telegramLoginRequests)
      .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()));
    if (!row || !secretMatches(pollSecret, row.pollSecretHash)) return { status: "expired" };
    if (row.failure === "identity_conflict") {
      const consumed = await this.consume(nonce);
      return consumed ? { status: "conflict" } : { status: "expired" };
    }
    if (row.userId === null) return { status: "pending" };

    // Single-use: the `consumed_at IS NULL` predicate is what makes two
    // concurrent polls resolve to one session rather than two.
    if (!(await this.consume(nonce))) return { status: "expired" };

    const session = await this.auth.issueSession(row.userId, row.isNewUser);
    return { status: "ready", ...session };
  }

  async purgeExpired(): Promise<number> {
    const removed = await this.db
      .delete(telegramLoginRequests)
      .where(lt(telegramLoginRequests.expiresAt, new Date()))
      .returning({ nonce: telegramLoginRequests.nonce });
    return removed.length;
  }

  // Unspent and unexpired. Every read and every write shares these, so a row
  // can never be eligible for one step and stale for the next.
  private livePredicates() {
    return [
      isNull(telegramLoginRequests.consumedAt),
      gt(telegramLoginRequests.expiresAt, sql`now()`),
    ];
  }

  private async consume(nonce: string): Promise<boolean> {
    const consumed = await this.db
      .update(telegramLoginRequests)
      .set({ consumedAt: new Date() })
      .where(and(eq(telegramLoginRequests.nonce, nonce), ...this.livePredicates()))
      .returning({ nonce: telegramLoginRequests.nonce });
    return consumed.length > 0;
  }
}
