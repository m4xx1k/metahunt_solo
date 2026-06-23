import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { asString, asStringArray } from "../../platform/shared/coerce";
import {
  SUBSCRIPTION_PARAM_KEYS,
  type SubscriptionParams,
} from "./subscriptions.contract";
import { copy } from "./telegram-copy";

const { subscriptions, nodes } = schema;

const MAX_SUMMARY_ROLES = 2;

// CV subs store array filters (`seniorities`), feed subs a scalar (`seniority`).
function asEnumList(arrayVal: unknown, scalarVal: unknown): string[] {
  const arr = asStringArray(arrayVal);
  if (arr.length > 0) return arr;
  const scalar = asString(scalarVal);
  return scalar ? [scalar] : [];
}

// Postgres `uuid` columns reject malformed input at the driver level, so we
// screen the deep-link token before it reaches a query.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkResult =
  | "linked"
  | "already_active"
  | "duplicate"
  | "not_found";

// What the digest needs to match a subscription, independent of delivery — so
// matching can run for preview on an unlinked row. createdAt is the new-since floor.
export interface SubscriptionMatchTarget {
  id: string;
  params: SubscriptionParams;
  candidateId: string | null;
  createdAt: Date;
}

export interface ActiveSubscription extends SubscriptionMatchTarget {
  chatId: string;
}

/**
 * Thin persistence layer for the Telegram bot — link/unlink only. All vacancy
 * matching stays in the catalog services; the bot is transport, not business
 * logic.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly analytics: AnalyticsService,
  ) {}

  // Pending (inactive, unlinked) until `/start <id>`. Persists only whitelisted
  // keys. Returns the id, which doubles as the deep-link token.
  async create(
    rawParams: SubscriptionParams,
    candidateId?: string,
  ): Promise<string> {
    const params: SubscriptionParams = {};
    for (const key of SUBSCRIPTION_PARAM_KEYS) {
      const value = rawParams[key];
      if (value !== undefined && value !== null) params[key] = value;
    }
    if (candidateId !== undefined && !UUID_REGEX.test(candidateId)) {
      throw new Error(`invalid candidateId: ${candidateId}`);
    }

    const [created] = await this.db
      .insert(subscriptions)
      .values({ params, candidateId: candidateId ?? null })
      .returning({ id: subscriptions.id });

    this.logger.log(
      `create sub ${created.id}: candidateId=${candidateId ?? "none"} paramKeys=[${Object.keys(params).join(",")}]`,
    );

    // Funnel entry, keyed on the uuid the web client will alias its anonymous
    // visitor onto — this is what stitches the browser session to the person.
    this.analytics.subscriptionCreated(created.id, params);

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
  async linkChat(token: string, chatId: string): Promise<LinkResult> {
    if (!UUID_REGEX.test(token)) return "not_found";

    const [pending] = await this.db
      .select({
        chatId: subscriptions.chatId,
        isActive: subscriptions.isActive,
        candidateId: subscriptions.candidateId,
        params: subscriptions.params,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, token));
    if (!pending) return "not_found";

    // Already activated: re-tapping the same link from the same chat is a
    // no-op; a token already claimed by another chat is treated as unusable.
    if (pending.isActive) {
      return pending.chatId === chatId ? "already_active" : "not_found";
    }

    // Dedup on the full identity: same chat, same params AND same candidate.
    // Without candidateId two different CVs (or a CV vs a feed sub) with the
    // same filters would collapse into one.
    const [duplicate] = await this.db
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
      await this.db.delete(subscriptions).where(eq(subscriptions.id, token));
      this.logger.log(`link ${token}: duplicate of ${duplicate.id} — dropped`);
      return "duplicate";
    }

    await this.db
      .update(subscriptions)
      .set({ chatId, isActive: true })
      .where(eq(subscriptions.id, token));
    this.logger.log(
      `link ${token}: activated for chat ${chatId} (candidateId=${pending.candidateId ?? "none"})`,
    );

    // Bridge №2: collapse the web/subscription person onto the canonical
    // `tg:<chatId>` human so the browser session and Telegram are one person.
    this.analytics.telegramLinked(token, chatId, "linked");
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
      .where(
        and(eq(subscriptions.chatId, chatId), eq(subscriptions.isActive, true)),
      );
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
        params: subscriptions.params,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.isActive, true)));
    if (!row || row.chatId === null) return null;
    return { ...row, chatId: row.chatId };
  }

  // Match target by id, any state — backs the read-only digest preview.
  async getMatchTarget(id: string): Promise<SubscriptionMatchTarget | null> {
    if (!UUID_REGEX.test(id)) return null;
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
    const stopped = await this.db
      .update(subscriptions)
      .set({ isActive: false })
      .where(
        and(eq(subscriptions.chatId, chatId), eq(subscriptions.isActive, true)),
      )
      .returning({ id: subscriptions.id });

    if (stopped.length > 0) {
      this.analytics.unsubscribed(chatId, {
        method: "stop_command",
        count: stopped.length,
      });
    }
    return stopped.length;
  }

  /**
   * Deactivate one subscription (the inline "unsubscribe" button). Scoped to
   * the chat so a forged callback can't touch someone else's subscription.
   */
  async deactivateById(id: string, chatId: string): Promise<boolean> {
    if (!UUID_REGEX.test(id)) return false;

    const stopped = await this.db
      .update(subscriptions)
      .set({ isActive: false })
      .where(
        and(
          eq(subscriptions.id, id),
          eq(subscriptions.chatId, chatId),
          eq(subscriptions.isActive, true),
        ),
      )
      .returning({ id: subscriptions.id });

    if (stopped.length > 0) {
      this.analytics.unsubscribed(chatId, {
        method: "button",
        subscriptionId: id,
      });
    }
    return stopped.length > 0;
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

  // Human label distinguishing one sub from another: CV marker, roles/skills,
  // then the headline filters (seniority, format, бронь, fit gate).
  async describe(
    params: SubscriptionParams,
    candidateId?: string | null,
  ): Promise<string> {
    const roleIds = asStringArray(params.roleIds);
    const skillIds = asStringArray(params.skillIds);

    const roleNames =
      roleIds.length > 0
        ? (
            await this.db
              .select({ name: nodes.canonicalName })
              .from(nodes)
              .where(inArray(nodes.id, roleIds))
          ).map((r) => r.name)
        : [];

    const parts: string[] = [];
    if (candidateId) parts.push(copy.describe.byCv);
    if (roleNames.length > 0) {
      const shown = roleNames.slice(0, MAX_SUMMARY_ROLES).join(", ");
      const extra = roleNames.length - MAX_SUMMARY_ROLES;
      parts.push(extra > 0 ? `${shown} +${extra}` : shown);
    }
    if (skillIds.length > 0) parts.push(copy.describe.skills(skillIds.length));

    const seniorities = asEnumList(params.seniorities, params.seniority);
    if (seniorities.length > 0) {
      parts.push(seniorities.map((s) => s.toLowerCase()).join("/"));
    }
    const formats = asEnumList(params.workFormats, params.workFormat);
    if (formats.length > 0) {
      parts.push(formats.map((f) => f.toLowerCase()).join("/"));
    }
    if (params.hasReservation === true) parts.push(copy.describe.reservation);
    if (typeof params.minFitTier === "string") {
      parts.push(`fit≥${params.minFitTier.toLowerCase()}`);
    }

    return parts.length > 0 ? parts.join(" · ") : copy.describe.all;
  }
}
