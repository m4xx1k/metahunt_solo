import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

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

import type { MeCv, MeSubscription, MeSubscriptionStatus } from "./me.contract";

const { authIdentities, userCvs, users, candidates, subscriptions } = schema;
const TELEGRAM_PROVIDER = "telegram";

interface SubscriptionUpdate {
  name?: string;
  isActive?: boolean;
  params?: SubscriptionParams;
}

// Read + manage the logged-in user's owned CVs and subscriptions. Every query is
// scoped to userId so one user can never touch another's rows.
// Never activated = created but not confirmed, which is a different thing
// from paused: the account has it, Telegram does not yet. `chatId` is the
// signal, not `linkedAt`/`deactivatedReason` — both of those are null on
// legacy rows deactivated before those columns existed, which would
// otherwise misclassify a real "off" row as "pending".
function subscriptionStatus(row: {
  isActive: boolean;
  chatId: string | null;
}): MeSubscriptionStatus {
  if (row.isActive) return "live";
  if (row.chatId === null) return "pending";
  return "off";
}

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

  // Makes `id` (a user_cvs row, not a candidate id) the user's one active
  // CV — the schema comment's invariant ("replace = new row + old
  // isActive=false") made real for the CV switcher, not just a fresh
  // upload. One UPDATE, CASE-atomic, so there's never a moment with two
  // active rows: MET-144 dropped the `?cv=` URL param, so `GET /feed`'s
  // JWT-resolved active CV (`resolveActiveCandidateId`) is now the only way
  // a signed-in viewer's feed gets scored — this is what the "switch CV"
  // control in the UI calls.
  async activateCv(userId: string, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [link] = await tx
        .select({ candidateId: userCvs.candidateId })
        .from(userCvs)
        .where(and(eq(userCvs.id, id), eq(userCvs.userId, userId)));
      if (!link) return false;

      await tx
        .update(userCvs)
        .set({ isActive: sql`${userCvs.candidateId} = ${link.candidateId}` })
        .where(eq(userCvs.userId, userId));
      return true;
    });
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
        chatId: subscriptions.chatId,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));

    // Two CVs can carry the same role, so the filter description alone renders
    // two different subscriptions identically. The CV's own label is the only
    // thing that tells them apart.
    const cvMeta = new Map<string, { label: string; addedAt: string }>();
    const candidateIds = rows.map((r) => r.candidateId).filter((id): id is string => id != null);
    if (candidateIds.length > 0) {
      const cvRows = await this.db
        .select({
          candidateId: userCvs.candidateId,
          label: userCvs.label,
          createdAt: userCvs.createdAt,
        })
        .from(userCvs)
        .where(and(eq(userCvs.userId, userId), inArray(userCvs.candidateId, candidateIds)));
      for (const c of cvRows)
        cvMeta.set(c.candidateId, { label: c.label, addedAt: c.createdAt.toISOString() });
    }

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
          status: subscriptionStatus(r),
          createdAt: r.createdAt.toISOString(),
          tgUsername: r.tgUsername,
          tgFirstName: r.tgFirstName,
        };
        if (r.candidateId) {
          return {
            ...base,
            isCv: true as const,
            candidateId: r.candidateId,
            cvLabel: cvMeta.get(r.candidateId)?.label ?? null,
            cvAddedAt: cvMeta.get(r.candidateId)?.addedAt ?? null,
            params,
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
    let deactivatedPersonId: string | null = null;
    const patched = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: subscriptions.id,
          candidateId: subscriptions.candidateId,
          isActive: subscriptions.isActive,
          personId: subscriptions.personId,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
        .for("update");
      if (!existing) return false;

      // Editing writes `params` straight over the row, which is the same
      // identity `create()` refuses to duplicate — without this an edit could
      // reach a filter the account already has and quietly deliver it twice.
      // Live only: a pending twin delivers nothing, and linkChat drops it.
      if (params !== undefined) {
        const [conflict] = await tx
          .select({ id: subscriptions.id, name: subscriptions.name })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.userId, userId),
              ne(subscriptions.id, existing.id),
              eq(subscriptions.isActive, true),
              sql`${subscriptions.params} = ${JSON.stringify(params)}::jsonb`,
            ),
          )
          .limit(1);
        if (conflict) {
          throw new ConflictException({
            message: "You already have an alert with these filters",
            conflictsWith: { id: conflict.id, name: conflict.name },
          });
        }
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
      if (!patch.isActive) deactivatedPersonId = existing.personId;
      return true;
    });
    // Captured after commit: a rolled-back change must not be reported.
    if (deactivatedPersonId) this.posthog.subscriptionDeactivated(deactivatedPersonId, "user");
    return patched;
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
