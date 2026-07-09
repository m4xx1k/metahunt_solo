import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { SubscriptionsService } from "../04-notify/telegram/subscriptions.service";
import type { SubscriptionParams } from "../04-notify/telegram/subscriptions.contract";
import type { MeCv, MeSubscription } from "./me.contract";

const { userCvs, candidates, subscriptions } = schema;

// Read + manage the logged-in user's owned CVs and subscriptions. Every query is
// scoped to userId so one user can never touch another's rows.
@Injectable()
export class MeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly subscriptionsSvc: SubscriptionsService,
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

  // Link an already-ingested candidate to this user (upload-while-logged-in).
  // Mirrors auth.claim(): unknown candidate is a no-op, dup (userId,candidateId)
  // is swallowed, and it only becomes active if the user has no active CV yet.
  async linkCv(userId: string, candidateId: string): Promise<void> {
    const [cand] = await this.db
      .select({ role: candidates.role })
      .from(candidates)
      .where(eq(candidates.id, candidateId));
    if (!cand) return;

    const [active] = await this.db
      .select({ id: userCvs.id })
      .from(userCvs)
      .where(and(eq(userCvs.userId, userId), eq(userCvs.isActive, true)));

    await this.db
      .insert(userCvs)
      .values({
        userId,
        candidateId,
        label: cand.role ?? "CV",
        isActive: !active,
      })
      .onConflictDoNothing();
  }

  async deleteCv(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userCvs)
      .where(and(eq(userCvs.id, id), eq(userCvs.userId, userId)))
      .returning({ id: userCvs.id });
    return deleted.length > 0;
  }

  async listSubscriptions(userId: string): Promise<MeSubscription[]> {
    const rows = await this.db
      .select({
        id: subscriptions.id,
        params: subscriptions.params,
        candidateId: subscriptions.candidateId,
        isActive: subscriptions.isActive,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt));
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        label: await this.subscriptionsSvc.describe(
          r.params as SubscriptionParams,
          r.candidateId,
        ),
        isActive: r.isActive,
        isCv: r.candidateId !== null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }

  async setSubscriptionActive(
    userId: string,
    id: string,
    isActive: boolean,
  ): Promise<boolean> {
    const updated = await this.db
      .update(subscriptions)
      .set({ isActive })
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
      .returning({ id: subscriptions.id });
    return updated.length > 0;
  }

  async deleteSubscription(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
      .returning({ id: subscriptions.id });
    return deleted.length > 0;
  }
}
