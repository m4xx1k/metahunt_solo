import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, DrizzleExecutor } from "@metahunt/database";

import type { AuthProvider, AuthUser, TelegramLoginResponse } from "./auth.contract";
import type { JwtPayload } from "./auth.types";
import { verifyGoogleIdToken } from "./google-verify";

const { users, authIdentities, subscriptions } = schema;

// Waitlist rows are stored lowercased (users.service.ts), and Postgres eq() is
// case-sensitive — without this the adoption lookup silently never matches.
function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

const TELEGRAM = "telegram";
const GOOGLE = "google";
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

  /**
   * Upsert the user behind a Telegram id and adopt what that chat owns.
   * **Server-trusted callers only** — a chat id straight off a Bot API update.
   */
  async resolveTelegramUser(
    telegramId: string,
    username: string | null,
    firstName: string | null,
    db: DrizzleExecutor = this.db,
  ): Promise<{ userId: string; created: boolean }> {
    const { userId, created } = await this.upsertIdentity(
      { provider: TELEGRAM, providerUserId: telegramId },
      { username, firstName },
      { source: "telegram-login", db },
    );
    await this.syncRoles(userId, db);
    await this.claimTelegramSubscriptions(userId, telegramId, db);
    return { userId, created };
  }

  /**
   * Recompute admin membership from the account's *current* Telegram identities.
   * Must run on every session mint and every link/unlink: granting without a
   * matching revoke would leave an ex-admin permanently privileged, and removing
   * them from ADMIN_TELEGRAM_IDS would silently do nothing.
   */
  private async syncRoles(userId: string, db: DrizzleExecutor): Promise<void> {
    const owned = await db
      .select({ providerUserId: authIdentities.providerUserId })
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, TELEGRAM)));
    const isAdmin = owned.some((i) => this.adminIds.has(i.providerUserId));
    await db
      .update(users)
      .set({ roles: isAdmin ? ["user", "admin"] : ["user"] })
      .where(eq(users.id, userId));
  }

  /**
   * Google sign-in. Mirrors the Telegram path: verify the provider's proof,
   * resolve a user, mint our own session. Google is a login event, nothing more.
   */
  async loginGoogle(credential: string): Promise<TelegramLoginResponse> {
    const profile = await this.verifyGoogle(credential);
    const { userId, created } = await this.db.transaction(async (tx) => {
      const result = await this.upsertIdentity(
        { provider: GOOGLE, providerUserId: profile.sub },
        { username: null, firstName: profile.firstName, email: profile.email },
        { source: "google-login", db: tx },
      );
      await this.syncRoles(result.userId, tx);
      return result;
    });
    return this.issueSession(userId, created);
  }

  async linkGoogleTo(userId: string, credential: string): Promise<void> {
    const profile = await this.verifyGoogle(credential);
    await this.linkIdentity(userId, GOOGLE, profile.sub, {
      username: null,
      firstName: profile.firstName,
      email: profile.email,
    });
  }

  async linkTrustedTelegramUser(
    userId: string,
    telegramId: string,
    profile: { username: string | null; firstName: string | null },
    db: DrizzleExecutor = this.db,
  ): Promise<void> {
    await this.linkIdentityInTransaction(userId, TELEGRAM, telegramId, profile, db);
    await this.syncRoles(userId, db);
    await this.claimTelegramSubscriptions(userId, telegramId, db);
  }

  // Verified email only: an unverified address must never key an adoption or
  // land on the user row, or anyone could claim a waitlist signup by typing it.
  private async verifyGoogle(
    credential: string,
  ): Promise<{ sub: string; firstName: string | null; email: string | null }> {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID") ?? "";
    if (clientId.length === 0) {
      throw new ServiceUnavailableException("Google login is not configured");
    }
    const profile = await verifyGoogleIdToken(credential, clientId);
    if (!profile) throw new UnauthorizedException("Google authentication failed");
    return {
      sub: profile.sub,
      firstName: profile.firstName,
      email: profile.emailVerified ? profile.email : null,
    };
  }

  /**
   * Attach a provider to the *caller's* account. Refuses when the identity
   * already belongs to someone else: merging two accounts is destructive and
   * irreversible, so it needs a real merge flow, not a silent reassignment.
   */
  async linkIdentity(
    userId: string,
    provider: string,
    providerUserId: string,
    profile: { username: string | null; firstName: string | null; email?: string | null },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.linkIdentityInTransaction(userId, provider, providerUserId, profile, tx);
    });
    this.logger.log(`linked ${provider} to user ${userId}`);
  }

  private async linkIdentityInTransaction(
    userId: string,
    provider: string,
    providerUserId: string,
    profile: { username: string | null; firstName: string | null; email?: string | null },
    db: DrizzleExecutor,
  ): Promise<void> {
    // Let the unique constraint arbitrate instead of check-then-insert: two
    // concurrent links would both see "free" and one would die on a raw 23505.
    const inserted = await db
      .insert(authIdentities)
      .values({
        userId,
        provider,
        providerUserId,
        username: profile.username,
        firstName: profile.firstName,
        email: profile.email ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: authIdentities.id });
    if (inserted.length > 0) return;

    const [owner] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerUserId, providerUserId),
        ),
      );
    if (!owner || owner.userId !== userId) {
      throw new ConflictException(`This ${provider} account is already linked elsewhere`);
    }
    // Already ours: refresh the snapshot so a relink is a no-op, not an error.
    await db
      .update(authIdentities)
      .set({
        username: profile.username,
        firstName: profile.firstName,
        email: profile.email ?? null,
      })
      .where(and(eq(authIdentities.userId, userId), eq(authIdentities.provider, provider)));
  }

  /** Unlinking the last identity would lock the account out of itself. */
  async unlinkIdentity(userId: string, provider: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Locked, and counted by survivors rather than by total — two concurrent
      // unlinks would otherwise each see "2 left" and take one apiece.
      const owned = await tx
        .select({ id: authIdentities.id, provider: authIdentities.provider })
        .from(authIdentities)
        .where(eq(authIdentities.userId, userId))
        .for("update");
      const doomed = owned.filter((i) => i.provider === provider);
      if (doomed.length === 0) {
        throw new NotFoundException(`No ${provider} identity on this account`);
      }
      if (owned.length - doomed.length < 1) {
        throw new BadRequestException("Cannot unlink your only sign-in method");
      }
      await tx.delete(authIdentities).where(
        inArray(
          authIdentities.id,
          doomed.map((i) => i.id),
        ),
      );
      await this.syncRoles(userId, tx);
    });
    this.logger.log(`unlinked ${provider} from user ${userId}`);
  }

  /** Mint the session JWT for an already-resolved user. */
  async issueSession(userId: string, isNewUser: boolean): Promise<TelegramLoginResponse> {
    const user = await this.getMe(userId);
    if (!user) throw new UnauthorizedException("user not found");

    const token = this.jwt.sign({
      sub: user.id,
      tid: user.telegramId,
      roles: user.roles,
    } satisfies JwtPayload);
    this.logger.log(`login user ${user.id} roles=[${user.roles.join(",")}] new=${isNewUser}`);
    return { token, user, isNewUser };
  }

  // The guard calls this on every authenticated request, so the identity list
  // rides along on the same join rather than a second query.
  async getMe(userId: string): Promise<AuthUser | null> {
    const rows = await this.db
      .select({
        id: users.id,
        roles: users.roles,
        waitlistEmail: users.email,
        provider: authIdentities.provider,
        providerUserId: authIdentities.providerUserId,
        username: authIdentities.username,
        firstName: authIdentities.firstName,
        email: authIdentities.email,
        linkedAt: authIdentities.createdAt,
      })
      .from(users)
      .leftJoin(authIdentities, eq(authIdentities.userId, users.id))
      .where(eq(users.id, userId))
      // Unordered rows would let the display name flip between requests.
      .orderBy(authIdentities.createdAt);
    if (rows.length === 0) return null;

    const linked = rows.filter((r) => r.provider !== null);
    const telegram = linked.find((r) => r.provider === TELEGRAM);
    // Any identity's name beats none, so a Google-only account still renders
    // something in the header instead of an anonymous chip.
    const named = telegram ?? linked[0];

    return {
      id: rows[0].id,
      telegramId: telegram?.providerUserId ?? null,
      username: named?.username ?? null,
      firstName: named?.firstName ?? null,
      email: linked.find((r) => r.email !== null)?.email ?? rows[0].waitlistEmail,
      roles: rows[0].roles ?? [],
      identities: linked.map((r) => ({
        provider: r.provider as AuthProvider,
        username: r.username,
        firstName: r.firstName,
        linkedAt: r.linkedAt!.toISOString(),
      })),
    };
  }

  private async upsertIdentity(
    identity: { provider: string; providerUserId: string },
    profile: { username: string | null; firstName: string | null; email?: string | null },
    opts: { source: string; db: DrizzleExecutor },
  ): Promise<{ userId: string; created: boolean }> {
    const { db, source } = opts;
    const email = normalizeEmail(profile.email);
    const match = and(
      eq(authIdentities.provider, identity.provider),
      eq(authIdentities.providerUserId, identity.providerUserId),
    );

    const [existing] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(match);

    if (existing) {
      await db
        .update(authIdentities)
        .set({ username: profile.username, firstName: profile.firstName, email })
        .where(match);
      return { userId: existing.userId, created: false };
    }

    const adopted = email ? await this.findAdoptableUserByEmail(email, db) : null;
    const userId = adopted ?? (await this.createUser(source, db));
    const inserted = await this.insertIdentity(userId, identity, profile, email, db);
    if (inserted) return { userId, created: adopted === null };

    const [winner] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(match);
    if (winner) {
      if (adopted === null) await db.delete(users).where(eq(users.id, userId));
      return { userId: winner.userId, created: false };
    }

    if (adopted !== null) {
      const freshUserId = await this.createUser(source, db);
      const retried = await this.insertIdentity(freshUserId, identity, profile, email, db);
      if (retried) return { userId: freshUserId, created: true };

      const [retryWinner] = await db
        .select({ userId: authIdentities.userId })
        .from(authIdentities)
        .where(match);
      await db.delete(users).where(eq(users.id, freshUserId));
      if (retryWinner) return { userId: retryWinner.userId, created: false };
    }

    throw new ConflictException(`Could not resolve ${identity.provider} account`);
  }

  private async createUser(source: string, db: DrizzleExecutor): Promise<string> {
    const [created] = await db
      .insert(users)
      .values({ source, roles: ["user"] })
      .returning({ id: users.id });
    return created.id;
  }

  private async insertIdentity(
    userId: string,
    identity: { provider: string; providerUserId: string },
    profile: { username: string | null; firstName: string | null },
    email: string | null,
    db: DrizzleExecutor,
  ): Promise<boolean> {
    const inserted = await db
      .insert(authIdentities)
      .values({
        userId,
        provider: identity.provider,
        providerUserId: identity.providerUserId,
        username: profile.username,
        firstName: profile.firstName,
        email,
      })
      .onConflictDoNothing()
      .returning({ id: authIdentities.id });
    return inserted.length > 0;
  }

  /**
   * A waitlist row and nothing else. The guard is "has no identity at all" —
   * any row with one has a real owner, and letting a verified address reach it
   * would hand the account to whoever controls that mailbox at the provider.
   */
  private async findAdoptableUserByEmail(
    email: string,
    db: DrizzleExecutor,
  ): Promise<string | null> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(authIdentities, eq(authIdentities.userId, users.id))
      .where(and(eq(users.email, email), isNull(authIdentities.id)));
    return row?.id ?? null;
  }

  // A Telegram private-chat id is server-trusted. Browser-provided candidate
  // UUIDs are not: accepting them would let anyone claim another user's CV.
  private async claimTelegramSubscriptions(
    userId: string,
    telegramId: string,
    db: DrizzleExecutor,
  ): Promise<void> {
    await db
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
