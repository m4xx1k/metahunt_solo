import { Inject, Injectable } from "@nestjs/common";

import { and, asc, eq, gt, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DigestDelivery, DigestProfileType, DrizzleDB } from "@metahunt/database";

import { AnalyticsService } from "../../platform/analytics/analytics.service";

const { digestDeliveries, sentNotifications, subscriptions, vacancies } = schema;

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
  ) {}

  /**
   * Vacancy ids already sent for this subscription among vacancies loaded after
   * `loadedAfter` — i.e. the ones that could still be candidates this run.
   * Bounded by the scan window so the exclusion list stays small.
   */
  async sentVacancyIds(subscriptionId: string, loadedAfter: Date): Promise<string[]> {
    const rows = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .innerJoin(vacancies, eq(vacancies.id, sentNotifications.vacancyId))
      .where(
        and(
          eq(sentNotifications.subscriptionId, subscriptionId),
          gt(vacancies.loadedAt, loadedAfter),
        ),
      );
    return rows.map((r) => r.vacancyId);
  }

  /**
   * Vacancy ids already sent to ANY subscription belonging to this chat, among
   * vacancies loaded after `loadedAfter`. Feeds the chat-scoped anti-join so a
   * chat with overlapping subscriptions never receives the same vacancy twice.
   */
  async sentVacancyIdsForChat(chatId: string, loadedAfter: Date): Promise<string[]> {
    const rows = await this.db
      .select({ vacancyId: sentNotifications.vacancyId })
      .from(sentNotifications)
      .innerJoin(vacancies, eq(vacancies.id, sentNotifications.vacancyId))
      .innerJoin(subscriptions, eq(subscriptions.id, sentNotifications.subscriptionId))
      .where(and(eq(subscriptions.chatId, chatId), gt(vacancies.loadedAt, loadedAfter)));
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
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(sentNotifications)
        .values(vacancyIds.map((vacancyId) => ({ subscriptionId, vacancyId })))
        .onConflictDoNothing()
        .returning({ vacancyId: sentNotifications.vacancyId });
      if (!delivery || inserted.length === 0) return;
      const [subscription] = await tx
        .select({ journeyId: subscriptions.journeyId })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscriptionId));
      if (subscription?.journeyId) {
        if (completesDelivery) {
          await this.analytics.enqueueDigestSent(tx, {
            subscriptionId,
            vacancies: delivery.vacancies,
            pages: delivery.pages,
            deliveryId: delivery.id,
            isFirstDigest: delivery.isFirstDigest,
            profileType: delivery.profileType,
            journeyId: subscription.journeyId,
          });
        }
      }
      await tx
        .update(digestDeliveries)
        .set({
          sentVacancies: sql`${digestDeliveries.sentVacancies} + ${inserted.length}`,
          sentPages: sql`${digestDeliveries.sentPages} + 1`,
          ...(completesDelivery ? { status: "completed" as const, completedAt: sql`now()` } : {}),
        })
        .where(eq(digestDeliveries.id, delivery.id));
    });
  }
}
