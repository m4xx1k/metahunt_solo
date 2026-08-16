import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsService } from "../platform/analytics/analytics.service";
import { PostHogClient } from "../platform/analytics/posthog.client";
import {
  InvalidSubscriptionCriteriaError,
  SubscriptionCriteriaService,
} from "../platform/subscriptions/subscription-criteria.service";
import { createSubscriptionName } from "../platform/subscriptions/subscription-name";
import type { SubscriptionParams } from "../platform/subscriptions/subscription.contract";

import type { EditableMatchCriteriaDto, MeCv, MeSubscription } from "./me.contract";

const { authIdentities, userCvs, users, candidates, subscriptions } = schema;
const TELEGRAM_PROVIDER = "telegram";

interface SubscriptionUpdate {
  name?: string;
  isActive?: boolean;
  params?: SubscriptionParams;
}

// Read + manage the logged-in user's owned CVs and subscriptions. Every query is
// scoped to userId so one user can never touch another's rows.
@Injectable()
export class MeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly criteria: SubscriptionCriteriaService,
    private readonly analytics: AnalyticsService,
    private readonly posthog: PostHogClient,
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
        name: subscriptions.name,
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
      rows.map(async (r) => {
        const storedParams = r.params as SubscriptionParams;
        const [label, params] = await Promise.all([
          this.criteria.describe(storedParams),
          this.criteria.toPublic(storedParams),
        ]);
        const base = {
          id: r.id,
          name: r.name ?? createSubscriptionName(r.id),
          label,
          isActive: r.isActive,
          createdAt: r.createdAt.toISOString(),
          tgUsername: r.tgUsername,
          tgFirstName: r.tgFirstName,
        };
        if (r.candidateId) {
          return {
            ...base,
            isCv: true as const,
            candidateId: r.candidateId,
            params: params as EditableMatchCriteriaDto,
          };
        }
        return { ...base, isCv: false as const, candidateId: null, params };
      }),
    );
  }

  async setSubscriptionActive(userId: string, id: string, isActive: boolean): Promise<boolean> {
    return this.updateSubscription(userId, id, { isActive });
  }

  async updateSubscription(
    userId: string,
    id: string,
    patch: SubscriptionUpdate,
  ): Promise<boolean> {
    let params: SubscriptionParams | undefined;
    try {
      params = patch.params ? await this.criteria.normalizeEditable(patch.params) : undefined;
    } catch (error) {
      if (error instanceof InvalidSubscriptionCriteriaError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: subscriptions.id,
          candidateId: subscriptions.candidateId,
          isActive: subscriptions.isActive,
          journeyId: subscriptions.journeyId,
          personId: subscriptions.personId,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
        .for("update");
      if (!existing) return false;
      if (params && existing.candidateId === null) {
        throw new BadRequestException("Only CV subscription criteria can be edited");
      }

      if (patch.name !== undefined) {
        await tx
          .update(subscriptions)
          .set({ name: patch.name })
          .where(eq(subscriptions.id, existing.id));
      }
      if (params !== undefined) {
        await tx.update(subscriptions).set({ params }).where(eq(subscriptions.id, existing.id));
      }

      const activeChanged = patch.isActive !== undefined && patch.isActive !== existing.isActive;
      if (!activeChanged || patch.isActive === undefined) return true;

      await tx
        .update(subscriptions)
        .set({
          isActive: patch.isActive,
          deactivatedAt: patch.isActive ? null : sql`now()`,
          deactivatedReason: patch.isActive ? null : "user",
        })
        .where(eq(subscriptions.id, existing.id));
      if (existing.journeyId) {
        if (patch.isActive) {
          await this.analytics.enqueueSubscriptionReactivated(tx, existing.id, existing.journeyId);
        } else {
          await this.analytics.enqueueUnsubscribed(tx, {
            method: "account",
            subscriptionId: existing.id,
            journeyId: existing.journeyId,
          });
        }
      } else if (patch.isActive) {
        void this.analytics.subscriptionReactivated(id);
      } else {
        void this.analytics.unsubscribed({ method: "account", subscriptionId: id });
      }
      if (!patch.isActive) this.posthog.subscriptionDeactivated(existing.personId, "user");
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
