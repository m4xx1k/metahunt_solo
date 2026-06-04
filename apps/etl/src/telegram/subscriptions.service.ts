import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import {
  SUBSCRIPTION_PARAM_KEYS,
  type SubscriptionParams,
} from "./subscriptions.contract";

const { subscriptions, nodes } = schema;

const MAX_SUMMARY_ROLES = 2;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
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

/** An active subscription with its delivery target — the digest engine's unit of work. */
export interface ActiveSubscription {
  id: string;
  /** Non-null for active rows (set at link time alongside activation). */
  chatId: string;
  params: SubscriptionParams;
  /** Floor for "new since" matching — never notify about pre-subscription vacancies. */
  createdAt: Date;
}

/**
 * Thin persistence layer for the Telegram bot — link/unlink only. All vacancy
 * matching stays in the catalog services; the bot is transport, not business
 * logic.
 */
@Injectable()
export class SubscriptionsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Create a pending subscription from the web facet filter. Persists only the
   * known feed-query keys (so `params` stays a clean, replayable query) and
   * leaves it inactive + unlinked until the user runs `/start <id>`. Returns
   * the new id, which doubles as the deep-link token.
   */
  async create(rawParams: SubscriptionParams): Promise<string> {
    const params: SubscriptionParams = {};
    for (const key of SUBSCRIPTION_PARAM_KEYS) {
      const value = rawParams[key];
      if (value !== undefined && value !== null) params[key] = value;
    }

    const [created] = await this.db
      .insert(subscriptions)
      .values({ params })
      .returning({ id: subscriptions.id });

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

    const [duplicate] = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.chatId, chatId),
          eq(subscriptions.isActive, true),
          ne(subscriptions.id, token),
          sql`${subscriptions.params} = ${JSON.stringify(pending.params)}::jsonb`,
        ),
      );
    if (duplicate) {
      await this.db.delete(subscriptions).where(eq(subscriptions.id, token));
      return "duplicate";
    }

    await this.db
      .update(subscriptions)
      .set({ chatId, isActive: true })
      .where(eq(subscriptions.id, token));
    return "linked";
  }

  /** Active subscriptions for a chat — id + stored feed-query params. */
  async listActiveByChat(
    chatId: string,
  ): Promise<{ id: string; params: SubscriptionParams }[]> {
    return this.db
      .select({ id: subscriptions.id, params: subscriptions.params })
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
        params: subscriptions.params,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.isActive, true)));
    if (!row || row.chatId === null) return null;
    return { ...row, chatId: row.chatId };
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

  /** Short human label for `/list` — resolved role names + skill count. */
  async describe(params: SubscriptionParams): Promise<string> {
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
    if (roleNames.length > 0) {
      const shown = roleNames.slice(0, MAX_SUMMARY_ROLES).join(", ");
      const extra = roleNames.length - MAX_SUMMARY_ROLES;
      parts.push(extra > 0 ? `${shown} +${extra}` : shown);
    }
    if (skillIds.length > 0) parts.push(`${skillIds.length} скіл.`);

    return parts.length > 0 ? parts.join(" · ") : "усі вакансії";
  }
}
