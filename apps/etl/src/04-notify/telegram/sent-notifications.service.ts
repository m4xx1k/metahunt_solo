import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { and, asc, eq, gt, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DigestDelivery, DigestProfileType, DrizzleDB } from "@metahunt/database";

import type { SubscriberIdentity } from "../../platform/analytics/analytics.ports";
import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { PostHogClient } from "../../platform/analytics/posthog.client";

const { digestDeliveries, sentNotifications, subscriptions } = schema;

const DAY_MS = 86_400_000;

export interface CreateDigestDelivery {
  id: string;
  subscriptionId: string;
  vacancies: number;
  matchedVacancies: number;
  pages: number;
  isFirstDigest: boolean;
  profileType: DigestProfileType;
}

/**
 * Persistence for the "already sent" ledger. The composite PK
 * (subscription_id, vacancy_id) makes a double-send impossible even under
 * retry; the anti-join this table feeds — not a stored watermark — is what
 * makes digest matching correct (see migration tracker #decisions).
 */
@Injectable()
export class SentNotificationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly analytics: AnalyticsService,
    private readonly posthog: PostHogClient,
    private readonly config: ConfigService,
  ) {}

  // Bump-time candidacy (feed.service.ts buildWhere) means a Position loaded
  // long ago but bumped yesterday is a fresh candidate — bounding "already
  // sent" by vacancy load time would then exclude nothing and the digest
  // re-sends it every run. Bound by `sent_at` instead: a re-bump may notify
  // again only after DIGEST_RESEND_LOOKBACK_DAYS have passed since the send.
  private resendFloor(): Date {
    const days = this.config.get<number>("DIGEST_RESEND_LOOKBACK_DAYS", 1);
    return new Date(Date.now() - days * DAY_MS);
  }

  /**
   * Vacancy ids already sent for this subscription within the resend lookback
   * window — i.e. still off-limits for a repeat notification.
   */
  async sentVacancyIds(subscriptionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .where(
        and(
          eq(sentNotifications.subscriptionId, subscriptionId),
          gt(sentNotifications.sentAt, this.resendFloor()),
        ),
      );
    return rows.map((r) => r.vacancyId);
  }

  /**
   * Vacancy ids already sent to ANY subscription belonging to this chat within
   * the resend lookback window. Feeds the chat-scoped anti-join so a chat with
   * overlapping subscriptions never receives the same vacancy twice.
   */
  async sentVacancyIdsForChat(chatId: string): Promise<string[]> {
    const rows = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .innerJoin(subscriptions, eq(subscriptions.id, sentNotifications.subscriptionId))
      .where(
        and(eq(subscriptions.chatId, chatId), gt(sentNotifications.sentAt, this.resendFloor())),
      );
    return rows.map((r) => r.vacancyId);
  }

  async hasCompletedDelivery(subscriptionId: string): Promise<boolean> {
    const [delivery] = await this.db
      .select({ id: digestDeliveries.id })
      .from(digestDeliveries)
      .where(
        and(
          eq(digestDeliveries.subscriptionId, subscriptionId),
          eq(digestDeliveries.status, "completed"),
        ),
      )
      .limit(1);
    if (delivery) return true;

    // Before delivery envelopes existed, sent_notifications was the only
    // durable delivery evidence. Use it only when this subscription has no
    // envelope at all; a new partial page always has a pending envelope and
    // must not flip isFirstDigest.
    const [anyEnvelope] = await this.db
      .select({ id: digestDeliveries.id })
      .from(digestDeliveries)
      .where(eq(digestDeliveries.subscriptionId, subscriptionId))
      .limit(1);
    if (anyEnvelope) return false;
    const [legacySent] = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .where(eq(sentNotifications.subscriptionId, subscriptionId))
      .limit(1);
    return legacySent !== undefined;
  }

  async pendingDelivery(subscriptionId: string): Promise<DigestDelivery | null> {
    const [delivery] = await this.db
      .select()
      .from(digestDeliveries)
      .where(
        and(
          eq(digestDeliveries.subscriptionId, subscriptionId),
          eq(digestDeliveries.status, "pending"),
        ),
      )
      .orderBy(asc(digestDeliveries.createdAt))
      .limit(1);
    return delivery ?? null;
  }

  async createDelivery(input: CreateDigestDelivery): Promise<DigestDelivery> {
    const [created] = await this.db
      .insert(digestDeliveries)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [existing] = await this.db
      .select()
      .from(digestDeliveries)
      .where(
        and(
          eq(digestDeliveries.subscriptionId, input.subscriptionId),
          eq(digestDeliveries.status, "pending"),
        ),
      );
    if (!existing) throw new Error(`digest delivery ${input.id} disappeared after insert`);
    return existing;
  }

  /** Record a sent page. Idempotent — the PK collision is ignored on retry. */
  async record(
    subscriptionId: string,
    vacancyIds: string[],
    delivery?: DigestDelivery,
    completesDelivery = false,
  ): Promise<void> {
    if (vacancyIds.length === 0) return;
    const subscriber = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(sentNotifications)
        .values(vacancyIds.map((vacancyId) => ({ subscriptionId, vacancyId })))
        .onConflictDoNothing()
        .returning({ vacancyId: sentNotifications.vacancyId });
      if (!delivery || inserted.length === 0) return null;
      const [subscription] = await tx
        .select({ personId: subscriptions.personId, candidateId: subscriptions.candidateId })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId));
      await tx
        .update(digestDeliveries)
        .set({
          sentVacancies: sql`${digestDeliveries.sentVacancies} + ${inserted.length}`,
          sentPages: sql`${digestDeliveries.sentPages} + 1`,
          ...(completesDelivery ? { status: "completed" as const, completedAt: sql`now()` } : {}),
        })
        .where(eq(digestDeliveries.id, delivery.id));
      if (!completesDelivery || !subscription) return null;
      return {
        personId: subscription.personId,
        subscriptionKind: subscription.candidateId ? "cv" : "feed",
      } satisfies SubscriberIdentity;
    });
    // Captured after commit: a rolled-back delivery must not report a digest
    // that was never sent.
    if (subscriber) this.posthog.digestSent(subscriber.personId, subscriber.subscriptionKind);
  }
}
