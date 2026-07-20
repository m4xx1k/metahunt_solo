import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { and, eq, isNull } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { AuthUser, TelegramLoginResponse } from "./auth.contract";
import type { JwtPayload } from "./auth.types";
import { verifyTelegramAuth, type TelegramAuthPayload } from "./telegram-verify";

const { users, authIdentities, subscriptions } = schema;

const PROVIDER = "telegram";
// Telegram login: verify the widget payload, upsert the user + identity, claim
// only server-trusted Telegram subscriptions, and mint the app's own session JWT.
// Telegram is only the login event — every later request is authed by our JWT.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminIds: Set<string>;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.adminIds = new Set(
      (this.config.get<string>("ADMIN_TELEGRAM_IDS") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }

  async loginTelegram(payload: TelegramAuthPayload): Promise<TelegramLoginResponse> {
    const botToken = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (botToken.length === 0) {
      throw new ServiceUnavailableException("Telegram login is not configured");
    }
    if (!verifyTelegramAuth(payload, botToken)) {
      throw new UnauthorizedException("Telegram authentication failed");
    }

    const telegramId = String(payload.id);
    const username = typeof payload.username === "string" ? payload.username : null;
    const firstName = typeof payload.first_name === "string" ? payload.first_name : null;
    // Admin membership is env-driven and re-evaluated every login, so promoting
    // or removing an admin is just an ADMIN_TELEGRAM_IDS change + re-login.
    const roles = this.adminIds.has(telegramId) ? ["user", "admin"] : ["user"];

    const userId = await this.upsertUser(telegramId, username, firstName, roles);
    await this.claimTelegramSubscriptions(userId, telegramId);

    const token = this.jwt.sign({
      sub: userId,
      tid: telegramId,
      roles,
    } satisfies JwtPayload);
    this.logger.log(`login tg:${telegramId} -> user ${userId} roles=[${roles.join(",")}]`);
    return { token, user: { id: userId, telegramId, username, firstName, roles } };
  }

  async getMe(userId: string): Promise<AuthUser | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        roles: users.roles,
        telegramId: authIdentities.providerUserId,
        username: authIdentities.username,
        firstName: authIdentities.firstName,
      })
      .from(users)
      .leftJoin(
        authIdentities,
        and(eq(authIdentities.userId, users.id), eq(authIdentities.provider, PROVIDER)),
      )
      .where(eq(users.id, userId));
    if (!row) return null;
    return {
      id: row.id,
      telegramId: row.telegramId ?? null,
      username: row.username ?? null,
      firstName: row.firstName ?? null,
      roles: row.roles ?? [],
    };
  }

  // Find the telegram identity or create a fresh user + identity. Roles and the
  // profile snapshot are refreshed on every login.
  private async upsertUser(
    telegramId: string,
    username: string | null,
    firstName: string | null,
    roles: string[],
  ): Promise<string> {
    const [identity] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(eq(authIdentities.provider, PROVIDER), eq(authIdentities.providerUserId, telegramId)),
      );

    if (identity) {
      await this.db.update(users).set({ roles }).where(eq(users.id, identity.userId));
      await this.db
        .update(authIdentities)
        .set({ username, firstName })
        .where(
          and(eq(authIdentities.provider, PROVIDER), eq(authIdentities.providerUserId, telegramId)),
        );
      return identity.userId;
    }

    const [created] = await this.db
      .insert(users)
      .values({ source: "telegram-login", roles })
      .returning({ id: users.id });
    await this.db.insert(authIdentities).values({
      userId: created.id,
      provider: PROVIDER,
      providerUserId: telegramId,
      username,
      firstName,
    });
    return created.id;
  }

  // A Telegram private-chat id is server-trusted. Browser-provided candidate
  // UUIDs are not: accepting them would let anyone claim another user's CV.
  private async claimTelegramSubscriptions(userId: string, telegramId: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ userId })
      .where(
        and(
          eq(subscriptions.chatId, telegramId),
          isNull(subscriptions.userId),
          isNull(subscriptions.candidateId),
        ),
      );
  }
}
