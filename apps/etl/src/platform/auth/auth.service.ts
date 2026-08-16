import { createHash, randomBytes } from "node:crypto";

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

import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB, DrizzleExecutor } from "@metahunt/database";

import { AnalyticsService } from "../analytics/analytics.service";
import { PostHogClient } from "../analytics/posthog.client";

import type { AuthProvider, AuthUser, TelegramLoginResponse } from "./auth.contract";
import type { JwtPayload } from "./auth.types";
import { verifyGoogleIdToken } from "./google-verify";

const {
  accountMergeRequests,
  analyticsJourneys,
  authIdentities,
  subscriptions,
  telegramLoginRequests,
  userCvs,
  users,
} = schema;
const targetUserCvs = alias(userCvs, "target_user_cvs");

// Waitlist rows are stored lowercased (users.service.ts), and Postgres eq() is
// case-sensitive — without this the adoption lookup silently never matches.
function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function formatMergeCode(raw: string): string {
  return raw
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .match(new RegExp(`.{1,${MERGE_CODE_GROUP}}`, "g"))!
    .join("-");
}

function hashMergeCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

const TELEGRAM = "telegram";
const GOOGLE = "google";
const MERGE_CODE_BYTES = 8;
const MERGE_CODE_TTL_MS = 10 * 60 * 1000;
const MERGE_CODE_GROUP = 4;
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminIds: Set<string>;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly analytics?: AnalyticsService,
    private readonly posthog?: PostHogClient,
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
    this.captureAuthV2(userId, GOOGLE, created);
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

  async startAccountMerge(userId: string): Promise<{ code: string; expiresAt: Date }> {
    const code = formatMergeCode(randomBytes(MERGE_CODE_BYTES).toString("hex"));
    const expiresAt = new Date(Date.now() + MERGE_CODE_TTL_MS);
    await this.db.transaction(async (tx) => {
      await tx.delete(accountMergeRequests).where(eq(accountMergeRequests.sourceUserId, userId));
      await tx.insert(accountMergeRequests).values({
        sourceUserId: userId,
        codeHash: hashMergeCode(code),
        expiresAt,
      });
    });
    return { code, expiresAt };
  }

  async confirmAccountMerge(targetUserId: string, code: string): Promise<void> {
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{12,32}$/.test(normalizedCode)) {
      throw new BadRequestException("Invalid merge code");
    }
    let sourceUserId: string | null = null;
    await this.db.transaction(async (tx) => {
      const [request] = await tx
        .select({ id: accountMergeRequests.id, sourceUserId: accountMergeRequests.sourceUserId })
        .from(accountMergeRequests)
        .where(
          and(
            eq(accountMergeRequests.codeHash, hashMergeCode(normalizedCode)),
            isNull(accountMergeRequests.consumedAt),
            gt(accountMergeRequests.expiresAt, new Date()),
          ),
        )
        .for("update");
      if (!request) throw new BadRequestException("Merge code is expired or invalid");
      if (request.sourceUserId === targetUserId) {
        throw new BadRequestException("Choose a different account to merge into");
      }
      await this.mergeUserInto(targetUserId, request.sourceUserId, tx);
      // Deleting the source account cascades to this one-time request, which
      // makes the code permanently unusable without retaining its hash.
      sourceUserId = request.sourceUserId;
    });
    if (sourceUserId) this.analytics?.aliasPerson(sourceUserId, targetUserId);
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

  // Called after the identity write has committed. The Telegram path reaches
  // issueSession through TelegramLoginService, while Google calls this before
  // issuing its session; both producers have explicit account identity.
  captureAuthV2(userId: string, provider: AuthProvider, isNewUser: boolean): void {
    if (isNewUser) this.posthog?.accountCreated(userId, provider);
    this.posthog?.signedIn(userId, provider);
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

  private async mergeUserInto(
    targetUserId: string,
    sourceUserId: string,
    db: DrizzleExecutor,
  ): Promise<void> {
    const accounts = await db
      .select({ id: users.id, roles: users.roles })
      .from(users)
      .where(inArray(users.id, [targetUserId, sourceUserId]))
      .for("update");
    const target = accounts.find((account) => account.id === targetUserId);
    const source = accounts.find((account) => account.id === sourceUserId);
    if (!target || !source) throw new ConflictException("Account no longer exists");
    if (target.roles.includes("admin") || source.roles.includes("admin")) {
      throw new ConflictException("Administrator accounts cannot be merged");
    }

    const identities = await db
      .select({ userId: authIdentities.userId, provider: authIdentities.provider })
      .from(authIdentities)
      .where(inArray(authIdentities.userId, [targetUserId, sourceUserId]));
    const targetProviders = new Set(
      identities
        .filter((identity) => identity.userId === targetUserId)
        .map((identity) => identity.provider),
    );
    if (
      identities.some(
        (identity) => identity.userId === sourceUserId && targetProviders.has(identity.provider),
      )
    ) {
      throw new ConflictException("Both accounts have the same sign-in provider");
    }

    const [cvConflict] = await db
      .select({ id: userCvs.id })
      .from(userCvs)
      .innerJoin(
        targetUserCvs,
        and(
          eq(userCvs.candidateId, targetUserCvs.candidateId),
          eq(targetUserCvs.userId, targetUserId),
        ),
      )
      .where(eq(userCvs.userId, sourceUserId));
    if (cvConflict) throw new ConflictException("Both accounts own the same CV");

    await db
      .update(analyticsJourneys)
      .set({ personId: targetUserId })
      .where(eq(analyticsJourneys.personId, sourceUserId));
    await db
      .update(subscriptions)
      .set({ userId: targetUserId, personId: targetUserId })
      .where(eq(subscriptions.userId, sourceUserId));
    await db.update(userCvs).set({ userId: targetUserId }).where(eq(userCvs.userId, sourceUserId));
    await db
      .update(telegramLoginRequests)
      .set({ userId: targetUserId })
      .where(eq(telegramLoginRequests.userId, sourceUserId));
    await db
      .update(telegramLoginRequests)
      .set({ linkUserId: targetUserId })
      .where(eq(telegramLoginRequests.linkUserId, sourceUserId));
    await db
      .update(authIdentities)
      .set({ userId: targetUserId })
      .where(eq(authIdentities.userId, sourceUserId));
    await db.delete(users).where(eq(users.id, sourceUserId));
    await this.syncRoles(targetUserId, db);
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
    const unclaimed = and(
      eq(subscriptions.chatId, telegramId),
      isNull(subscriptions.userId),
      isNull(subscriptions.candidateId),
    );
    // Read the person ids the subscriptions carried before the claim rewrites
    // them: PostHog cannot stitch two people together retroactively, so the
    // merge has to be emitted at exactly this moment or never.
    const claimed = await db
      .select({ personId: subscriptions.personId })
      .from(subscriptions)
      .where(unclaimed);
    await db.update(subscriptions).set({ userId, personId: userId }).where(unclaimed);
    await db
      .update(analyticsJourneys)
      .set({ personId: userId })
      .where(
        inArray(
          analyticsJourneys.id,
          db
            .select({ journeyId: subscriptions.journeyId })
            .from(subscriptions)
            .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.candidateId))),
        ),
      );
    for (const personId of new Set(claimed.map((row) => row.personId))) {
      this.posthog?.mergePerson(userId, personId);
    }
  }
}
