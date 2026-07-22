import { Inject, Injectable } from "@nestjs/common";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import type { SubscriptionParams } from "../04-notify/telegram/subscriptions.contract";
import { SubscriptionsService } from "../04-notify/telegram/subscriptions.service";
import { AnalyticsService } from "../platform/analytics/analytics.service";

import type { MeCv, MeSubscription } from "./me.contract";

const { authIdentities, userCvs, users, candidates, subscriptions } = schema;
const TELEGRAM_PROVIDER = "telegram";

// Read + manage the logged-in user's owned CVs and subscriptions. Every query is
// scoped to userId so one user can never touch another's rows.
@Injectable()
export class MeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly subscriptionsSvc: SubscriptionsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async listCvs(userId: string): Promise<MeCv[]> {
    const rows = await this.db
      .select({
        id: userCvs.id,
        candidateId: userCvs.candidateId,
        label: userCvs.label,
        isActive: userCvs.isActive,
        role: candidates.role,
        seniority: candidates.seniority,
        experienceYears: candidates.experienceYears,
        createdAt: userCvs.createdAt,
      })
      .from(userCvs)
      .innerJoin(candidates, eq(candidates.id, userCvs.candidateId))
      .where(eq(userCvs.userId, userId))
      .orderBy(desc(userCvs.createdAt));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async deleteCv(userId: string, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [link] = await tx
        .select({ id: userCvs.id, candidateId: userCvs.candidateId })
        .from(userCvs)
        .where(and(eq(userCvs.id, id), eq(userCvs.userId, userId)));
      if (!link) return false;

      await tx
        .delete(subscriptions)
        .where(
          and(eq(subscriptions.userId, userId), eq(subscriptions.candidateId, link.candidateId)),
        );
      await tx.delete(userCvs).where(eq(userCvs.id, link.id));

      // A legacy candidate can have more than one owner link. Never delete a
      // shared row until its last owner removed it; new uploads are user-scoped.
      const [remainingOwner] = await tx
        .select({ id: userCvs.id })
        .from(userCvs)
        .where(eq(userCvs.candidateId, link.candidateId));
      if (!remainingOwner) {
        // Remove any legacy pending/active CV subscriptions too, so none can
        // keep referring to a deleted profile.
        await tx.delete(subscriptions).where(eq(subscriptions.candidateId, link.candidateId));
        await tx.delete(candidates).where(eq(candidates.id, link.candidateId));
      }
      return true;
    });
  }

  async listSubscriptions(userId: string): Promise<MeSubscription[]> {
    const rows = await this.db
      .select({
        id: subscriptions.id,
        params: subscriptions.params,
        candidateId: subscriptions.candidateId,
        isActive: subscriptions.isActive,
        createdAt: subscriptions.createdAt,
        tgUsername: subscriptions.tgUsername,
        tgFirstName: subscriptions.tgFirstName,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        label: await this.subscriptionsSvc.describe(r.params as SubscriptionParams, r.candidateId),
        isActive: r.isActive,
        isCv: r.candidateId !== null,
        createdAt: r.createdAt.toISOString(),
        tgUsername: r.tgUsername,
        tgFirstName: r.tgFirstName,
      })),
    );
  }

  async setSubscriptionActive(userId: string, id: string, isActive: boolean): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(subscriptions)
        .set({
          isActive,
          deactivatedAt: isActive ? null : sql`now()`,
        })
        .where(
          and(
            eq(subscriptions.id, id),
            eq(subscriptions.userId, userId),
            ne(subscriptions.isActive, isActive),
          ),
        )
        .returning({ id: subscriptions.id, journeyId: subscriptions.journeyId });
      if (!updated) {
        const [existing] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)));
        return existing !== undefined;
      }
      if (updated.journeyId) {
        if (isActive) {
          await this.analytics.enqueueSubscriptionReactivated(tx, updated.id, updated.journeyId);
        } else {
          await this.analytics.enqueueUnsubscribed(tx, {
            method: "account",
            subscriptionId: updated.id,
            journeyId: updated.journeyId,
          });
        }
      } else if (isActive) {
        void this.analytics.subscriptionReactivated(id);
      } else {
        void this.analytics.unsubscribed({ method: "account", subscriptionId: id });
      }
      return true;
    });
  }

  async deleteSubscription(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
      .returning({ id: subscriptions.id });
    return deleted.length > 0;
  }

  async deleteAccount(userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!account) return false;

      const identities = await tx
        .select({ telegramId: authIdentities.providerUserId })
        .from(authIdentities)
        .where(
          and(eq(authIdentities.userId, userId), eq(authIdentities.provider, TELEGRAM_PROVIDER)),
        );
      const ownedCvs = await tx
        .select({ candidateId: userCvs.candidateId })
        .from(userCvs)
        .where(eq(userCvs.userId, userId));

      const telegramIds = identities.map((identity) => identity.telegramId);
      if (telegramIds.length > 0) {
        await tx.delete(subscriptions).where(inArray(subscriptions.chatId, telegramIds));
      }

      await tx.delete(users).where(eq(users.id, userId));

      const candidateIds = [...new Set(ownedCvs.map((cv) => cv.candidateId))];
      if (candidateIds.length === 0) return true;

      const remainingOwners = await tx
        .select({ candidateId: userCvs.candidateId })
        .from(userCvs)
        .where(inArray(userCvs.candidateId, candidateIds));
      const retained = new Set(remainingOwners.map((owner) => owner.candidateId));
      const orphanCandidateIds = candidateIds.filter((id) => !retained.has(id));
      if (orphanCandidateIds.length === 0) return true;

      await tx.delete(subscriptions).where(inArray(subscriptions.candidateId, orphanCandidateIds));
      await tx
        .delete(candidates)
        .where(and(inArray(candidates.id, orphanCandidateIds), eq(candidates.type, "user")));
      return true;
    });
  }
}
