import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { AuthUser, TelegramLoginResponse } from "./auth.contract";
import type { JwtPayload } from "./auth.types";
import { verifyTelegramAuth, type TelegramAuthPayload } from "./telegram-verify";

const { users, authIdentities, userCvs, subscriptions, candidates } = schema;

const PROVIDER = "telegram";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Telegram login: verify the widget payload, upsert the user + identity, claim
// any anonymous CVs/subscriptions onto them, and mint the app's own session JWT.
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

  async loginTelegram(
    payload: TelegramAuthPayload,
    candidateIds: string[] = [],
  ): Promise<TelegramLoginResponse> {
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
    await this.claim(userId, telegramId, candidateIds);

    const token = this.jwt.sign({
      sub: userId,
      tid: telegramId,
      roles,
    } satisfies JwtPayload);
    this.logger.log(`login tg:${telegramId} -> user ${userId} roles=[${roles.join(",")}]`);
    return { token, user: { id: userId, telegramId, username, firstName, roles } };
  }

  // Dev-only login: mint a session for a configured telegram id WITHOUT verifying
  // a Telegram widget hash, so the app works on plain http://localhost (no tunnel,
  // no BotFather domain). Gated by DEV_LOGIN_ENABLED, which env validation forces
  // off in production. Reuses the exact same upsert/claim/sign path as the real
  // login, so the resulting token is indistinguishable downstream.
  async loginDev(candidateIds: string[] = []): Promise<TelegramLoginResponse> {
    if ((this.config.get<string>("DEV_LOGIN_ENABLED") ?? "") !== "1") {
      throw new UnauthorizedException("dev login is disabled");
    }
    const configured = this.config.get<string>("DEV_LOGIN_TELEGRAM_ID") ?? "";
    const telegramId = configured.length > 0 ? configured : ([...this.adminIds][0] ?? "0");
    const roles = this.adminIds.has(telegramId) ? ["user", "admin"] : ["user"];

    const userId = await this.upsertUser(telegramId, "devuser", "Dev", roles);
    await this.claim(userId, telegramId, candidateIds);

    const token = this.jwt.sign({ sub: userId, tid: telegramId, roles } satisfies JwtPayload);
    this.logger.warn(`DEV login tg:${telegramId} -> user ${userId} roles=[${roles.join(",")}]`);
    return {
      token,
      user: { id: userId, telegramId, username: "devuser", firstName: "Dev", roles },
    };
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

  // Adopt the user's anonymous artifacts: (a) subscriptions whose chatId is this
  // telegram id (private-chat id == user id — server-trusted), (b) CVs the
  // browser holds in localStorage. Newest claimed CV becomes active iff the user
  // has none yet (never clobbers an existing active choice).
  private async claim(userId: string, telegramId: string, candidateIds: string[]): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ userId })
      .where(and(eq(subscriptions.chatId, telegramId), isNull(subscriptions.userId)));

    const ids = candidateIds.filter((id) => UUID_REGEX.test(id));
    if (ids.length === 0) return;

    const rows = await this.db
      .select({ id: candidates.id, role: candidates.role })
      .from(candidates)
      .where(inArray(candidates.id, ids));
    if (rows.length === 0) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.filter((id) => byId.has(id));

    const [existingActive] = await this.db
      .select({ id: userCvs.id })
      .from(userCvs)
      .where(and(eq(userCvs.userId, userId), eq(userCvs.isActive, true)));
    const hasActive = Boolean(existingActive);

    await this.db
      .insert(userCvs)
      .values(
        ordered.map((id, i) => ({
          userId,
          candidateId: id,
          label: byId.get(id)?.role ?? "CV",
          isActive: !hasActive && i === 0,
        })),
      )
      .onConflictDoNothing();
  }
}
