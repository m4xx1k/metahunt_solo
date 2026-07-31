import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { isUuid } from "../../platform/shared/query-parsing";
import { SubscriptionCriteriaService } from "../../platform/subscriptions/subscription-criteria.service";
import { createSubscriptionName } from "../../platform/subscriptions/subscription-name";

import type { SubscriptionParams } from "./subscriptions.contract";
import type {
  ActiveSubscription,
  CreateSubscriptionOptions,
  LinkResult,
  SubscriptionMatchTarget,
  TelegramLinkIdentity,
} from "./subscriptions.types";

export type {
  ActiveSubscription,
  LinkResult,
  SubscriptionMatchTarget,
  TelegramLinkIdentity,
} from "./subscriptions.types";

const { analyticsJourneys, subscriptions, authIdentities, userCvs } = schema;
const TELEGRAM_PROVIDER = "telegram";

// Consecutive bounced digest sends before a chat is treated as gone.
const UNREACHABLE_DEACTIVATE_AFTER = 3;
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly analytics: AnalyticsService,
    private readonly criteria: SubscriptionCriteriaService,
  ) {}

  // Pending (inactive, unlinked) until `/start <id>`. Persists only whitelisted
  // keys. Returns the id, which doubles as the deep-link token.
  async create(
    rawParams: SubscriptionParams,
    options: CreateSubscriptionOptions = {},
  ): Promise<string> {
    const params = await this.criteria.normalize(rawParams);
    if (options.candidateId !== undefined && !isUuid(options.candidateId)) {
      throw new Error(`invalid candidateId: ${options.candidateId}`);
    }
    const journeyId = options.journeyId ?? randomUUID();
    const subscriptionId = randomUUID();

    const created = await this.db.transaction(async (tx) => {
      await tx
        .insert(analyticsJourneys)
        .values({
          id: journeyId,
          personId: options.userId ?? journeyId,
          origin: options.journeyId ? "browser" : "server",
        })
        .onConflictDoUpdate({
          target: analyticsJourneys.id,
          set: { personId: options.userId ?? journeyId, lastSeenAt: sql`now()` },
        });
      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          id: subscriptionId,
          name: createSubscriptionName(subscriptionId),
          params,
          candidateId: options.candidateId ?? null,
          userId: options.userId ?? null,
          personId: options.userId ?? journeyId,
          journeyId,
        })
        .returning({ id: subscriptions.id });
      await this.analytics.enqueueSubscriptionCreated(tx, subscription.id, journeyId, params);
      return subscription;
    });

    this.logger.log(
      `create sub ${created.id}: candidateId=${options.candidateId ?? "none"} paramKeys=[${Object.keys(params).join(",")}]`,
    );

    return created.id;
  }

  /**
   * Bind a chat to a pending subscription (the `/start <token>` payload) and
   * activate it. Distinguishes re-tapping an already-active link
   * (`already_active`) from a fresh activation, and if the chat already has an
   * active subscription with identical params, drops this pending row instead
   * of creating a duplicate. Dedup lives here because the chat is unknown at
   * web-create time.
   */
  async linkChat(
    token: string,
    chatId: string,
    telegramUser?: TelegramLinkIdentity,
  ): Promise<LinkResult> {
    if (!isUuid(token)) return "not_found";

    const [pending] = await this.db
      .select({
        chatId: subscriptions.chatId,
        isActive: subscriptions.isActive,
        candidateId: subscriptions.candidateId,
        userId: subscriptions.userId,
        journeyId: subscriptions.journeyId,
        params: subscriptions.params,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, token));
    if (!pending) return "not_found";

    // CV subscriptions are bound to their authenticated Telegram identity.
    // Legacy pending CV rows without an owner are deliberately not activated.
    if (
      pending.candidateId !== null &&
      !(await this.isCvSubscriptionOwner(pending.userId, chatId, pending.candidateId))
    ) {
      return "not_found";
    }
    const linkedUserId =
      pending.userId ?? telegramUser?.userId ?? (await this.findUserIdForChat(chatId));

    // Already activated: re-tapping the same link from the same chat is a
    // no-op; a token already claimed by another chat is treated as unusable.
    if (pending.isActive) {
      return pending.chatId === chatId ? "already_active" : "not_found";
    }

    const result = await this.db.transaction(async (tx) => {
      const lockKey = JSON.stringify([chatId, pending.candidateId, pending.params]);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      const [duplicate] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.chatId, chatId),
            eq(subscriptions.isActive, true),
            ne(subscriptions.id, token),
            pending.candidateId === null
              ? isNull(subscriptions.candidateId)
              : eq(subscriptions.candidateId, pending.candidateId),
            sql`${subscriptions.params} = ${JSON.stringify(pending.params)}::jsonb`,
          ),
        );
      if (duplicate) {
        if (linkedUserId) {
          await tx
            .update(subscriptions)
            .set({ userId: sql`coalesce(${subscriptions.userId}, ${linkedUserId})` })
            .where(eq(subscriptions.id, duplicate.id));
        }
        const [deleted] = await tx
          .delete(subscriptions)
          .where(
            and(
              eq(subscriptions.id, token),
              eq(subscriptions.isActive, false),
              isNull(subscriptions.chatId),
            ),
          )
          .returning({ id: subscriptions.id });
        return deleted ? { type: "duplicate" as const, duplicateId: duplicate.id } : null;
      }

      const [activated] = await tx
        .update(subscriptions)
        .set({
          chatId,
          isActive: true,
          userId: linkedUserId,
          personId: linkedUserId ?? pending.journeyId ?? token,
          linkedAt: sql`now()`,
          deactivatedAt: null,
          tgUsername: telegramUser?.username ?? null,
          tgFirstName: telegramUser?.firstName ?? null,
        })
        .where(
          and(
            eq(subscriptions.id, token),
            eq(subscriptions.isActive, false),
            isNull(subscriptions.chatId),
          ),
        )
        .returning({ id: subscriptions.id });
      if (activated && pending.journeyId && linkedUserId) {
        await tx
          .update(analyticsJourneys)
          .set({ personId: linkedUserId, lastSeenAt: sql`now()` })
          .where(eq(analyticsJourneys.id, pending.journeyId));
      }
      if (activated && pending.journeyId) {
        await this.analytics.enqueueTelegramLinked(tx, activated.id, pending.journeyId, "linked");
      }
      return activated ? { type: "linked" as const } : null;
    });
    if (result?.type === "duplicate") {
      this.logger.log(`link ${token}: duplicate of ${result.duplicateId} — dropped`);
      return "duplicate";
    }
    if (!result) {
      const [current] = await this.db
        .select({ chatId: subscriptions.chatId, isActive: subscriptions.isActive })
        .from(subscriptions)
        .where(eq(subscriptions.id, token));
      return current?.isActive && current.chatId === chatId ? "already_active" : "not_found";
    }

    this.logger.log(`link ${token}: activated (candidateId=${pending.candidateId ?? "none"})`);

    if (pending.journeyId && linkedUserId) {
      this.analytics.aliasJourneyToPerson(pending.journeyId, linkedUserId);
    }

    if (!pending.journeyId) void this.analytics.telegramLinked(token, "linked");
    return "linked";
  }

  /** Active subscriptions for a chat — full match targets (id, params, candidate). */
  async listActiveByChat(chatId: string): Promise<SubscriptionMatchTarget[]> {
    return this.db
      .select({
        id: subscriptions.id,
        params: subscriptions.params,
        candidateId: subscriptions.candidateId,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.isActive, true)));
  }

  /** Ids of every active subscription — the digest workflow's work-list. */
  async listActiveIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.isActive, true));
    return rows.map((r) => r.id);
  }

  /**
   * One active subscription by id, with its chat + creation floor. Null when it
   * was deactivated between listing and delivery (a benign race the engine skips).
   */
  async getActiveById(id: string): Promise<ActiveSubscription | null> {
    const [row] = await this.db
      .select({
        id: subscriptions.id,
        chatId: subscriptions.chatId,
        candidateId: subscriptions.candidateId,
        userId: subscriptions.userId,
        params: subscriptions.params,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.isActive, true)));
    if (!row || row.chatId === null) return null;
    if (
      row.candidateId !== null &&
      !(await this.isCvSubscriptionOwner(row.userId, row.chatId, row.candidateId))
    ) {
      return null;
    }
    return { ...row, chatId: row.chatId };
  }

  // Match target by id, any state — backs the read-only digest preview.
  async getMatchTarget(id: string): Promise<SubscriptionMatchTarget | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select({
        id: subscriptions.id,
        candidateId: subscriptions.candidateId,
        params: subscriptions.params,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, id));
    return row ?? null;
  }

  /** `/stop` — deactivate every subscription for a chat. Returns how many were active. */
  async deactivateByChat(chatId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const stopped = await tx
        .update(subscriptions)
        .set({ isActive: false, deactivatedAt: sql`now()`, deactivatedReason: "user" })
        .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.isActive, true)))
        .returning({ id: subscriptions.id, journeyId: subscriptions.journeyId });

      for (const stoppedSubscription of stopped) {
        if (stoppedSubscription.journeyId) {
          await this.analytics.enqueueUnsubscribed(tx, {
            method: "stop_command",
            subscriptionId: stoppedSubscription.id,
            journeyId: stoppedSubscription.journeyId,
            count: stopped.length,
          });
        } else {
          void this.analytics.unsubscribed({
            method: "stop_command",
            subscriptionId: stoppedSubscription.id,
            count: stopped.length,
          });
        }
      }
      return stopped.length;
    });
  }

  /**
   * Deactivate one subscription (the inline "unsubscribe" button). Scoped to
   * the chat so a forged callback can't touch someone else's subscription.
   */
  async deactivateById(id: string, chatId: string): Promise<boolean> {
    if (!isUuid(id)) return false;

    return this.db.transaction(async (tx) => {
      const [stopped] = await tx
        .update(subscriptions)
        .set({ isActive: false, deactivatedAt: sql`now()`, deactivatedReason: "user" })
        .where(
          and(
            eq(subscriptions.id, id),
            eq(subscriptions.chatId, chatId),
            eq(subscriptions.isActive, true),
          ),
        )
        .returning({ id: subscriptions.id, journeyId: subscriptions.journeyId });

      if (!stopped) return false;
      if (stopped.journeyId) {
        await this.analytics.enqueueUnsubscribed(tx, {
          method: "button",
          subscriptionId: stopped.id,
          journeyId: stopped.journeyId,
        });
      } else {
        void this.analytics.unsubscribed({ method: "button", subscriptionId: stopped.id });
      }
      return true;
    });
  }

  /**
   * The user blocked the bot (my_chat_member → kicked). Deactivate everything
   * on the chat with reason `blocked` so an unblock can restore exactly this
   * set — unlike an explicit unsubscribe, which must stay off.
   */
  async deactivateForBlock(chatId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const blocked = await tx
        .update(subscriptions)
        .set({ isActive: false, deactivatedAt: sql`now()`, deactivatedReason: "blocked" })
        .where(and(eq(subscriptions.chatId, chatId), eq(subscriptions.isActive, true)))
        .returning({ id: subscriptions.id, journeyId: subscriptions.journeyId });

      for (const sub of blocked) {
        const props = {
          method: "chat_member" as const,
          subscriptionId: sub.id,
          count: blocked.length,
        };
        if (sub.journeyId) {
          await this.analytics.enqueueBotBlocked(tx, { ...props, journeyId: sub.journeyId });
        } else {
          void this.analytics.botBlocked(props);
        }
      }
      return blocked.length;
    });
  }

  /** Unblock restores only what the block (or bounced deliveries) turned off. */
  async reactivateAfterUnblock(chatId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const restored = await tx
        .update(subscriptions)
        .set({
          isActive: true,
          deactivatedAt: null,
          deactivatedReason: null,
          unreachableCount: 0,
        })
        .where(
          and(
            eq(subscriptions.chatId, chatId),
            eq(subscriptions.isActive, false),
            inArray(subscriptions.deactivatedReason, ["blocked", "unreachable"]),
          ),
        )
        .returning({ id: subscriptions.id, journeyId: subscriptions.journeyId });

      for (const sub of restored) {
        if (sub.journeyId) {
          await this.analytics.enqueueSubscriptionReactivated(tx, sub.id, sub.journeyId, "unblock");
        } else {
          void this.analytics.subscriptionReactivated(sub.id, "unblock");
        }
      }
      return restored.length;
    });
  }

  /**
   * A digest send bounced with a 403. Count it; after the threshold the chat is
   * considered gone and the subscription stops burning an hourly send forever.
   * my_chat_member normally fires first — this is the safety net for updates
   * the poller missed (downtime, chats deleted without a block).
   */
  async recordUnreachableDelivery(id: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(subscriptions)
        .set({ unreachableCount: sql`${subscriptions.unreachableCount} + 1` })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.isActive, true)))
        .returning({
          unreachableCount: subscriptions.unreachableCount,
          journeyId: subscriptions.journeyId,
        });
      if (!row || row.unreachableCount < UNREACHABLE_DEACTIVATE_AFTER) return;

      await tx
        .update(subscriptions)
        .set({ isActive: false, deactivatedAt: sql`now()`, deactivatedReason: "unreachable" })
        .where(eq(subscriptions.id, id));
      const props = {
        method: "delivery_failure" as const,
        subscriptionId: id,
        count: row.unreachableCount,
      };
      if (row.journeyId) {
        await this.analytics.enqueueBotBlocked(tx, { ...props, journeyId: row.journeyId });
      } else {
        void this.analytics.botBlocked(props);
      }
    });
  }

  /** A send got through — the chat is reachable, restart the bounce counter. */
  async clearUnreachable(id: string): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ unreachableCount: 0 })
      .where(and(eq(subscriptions.id, id), ne(subscriptions.unreachableCount, 0)));
  }

  /**
   * Sweep orphan pending rows: created on the web (`POST /subscriptions`) but
   * never claimed via `/start`, so they sit unlinked forever. Each web tap mints
   * a fresh row, so abandoned taps accumulate — this is the GC for them. Only
   * unlinked, inactive rows past the TTL are removed; an active subscription is
   * never touched. Returns how many were deleted.
   */
  async purgeStalePending(maxAgeHours: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000);
    const deleted = await this.db
      .delete(subscriptions)
      .where(
        and(
          isNull(subscriptions.chatId),
          eq(subscriptions.isActive, false),
          lt(subscriptions.createdAt, cutoff),
        ),
      )
      .returning({ id: subscriptions.id });

    return deleted.length;
  }

  private async isCvSubscriptionOwner(
    userId: string | null,
    chatId: string,
    candidateId: string,
  ): Promise<boolean> {
    if (!userId) return false;
    const [identity, ...additionalIdentities] = await this.db
      .select({ telegramId: authIdentities.providerUserId })
      .from(authIdentities)
      .where(
        and(eq(authIdentities.userId, userId), eq(authIdentities.provider, TELEGRAM_PROVIDER)),
      );
    if (!identity || additionalIdentities.length > 0 || identity.telegramId !== chatId)
      return false;

    const owners = await this.db
      .select({ userId: userCvs.userId })
      .from(userCvs)
      .where(eq(userCvs.candidateId, candidateId));
    return owners.length === 1 && owners[0].userId === userId;
  }

  // Human label distinguishing one sub from another: CV marker, roles/skills,
  // then the headline filters (seniority, format, бронь, fit gate).
  async describe(params: SubscriptionParams, candidateId?: string | null): Promise<string> {
    return this.criteria.describe(params, candidateId);
  }

  private async findUserIdForChat(chatId: string): Promise<string | null> {
    const [identity] = await this.db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, TELEGRAM_PROVIDER),
          eq(authIdentities.providerUserId, chatId),
        ),
      );
    return identity?.userId ?? null;
  }
}
