import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

import {
  SUBSCRIPTION_PARAM_KEYS,
  type SubscriptionParams,
} from "./subscriptions.contract";

const { subscriptions } = schema;

// Postgres `uuid` columns reject malformed input at the driver level, so we
// screen the deep-link token before it reaches a query.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkResult = "linked" | "not_found";

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

  /** Bind a chat to a pending subscription (the `/start <token>` payload) and activate it. */
  async linkChat(token: string, chatId: string): Promise<LinkResult> {
    if (!UUID_REGEX.test(token)) return "not_found";

    const linked = await this.db
      .update(subscriptions)
      .set({ chatId, isActive: true })
      .where(eq(subscriptions.id, token))
      .returning({ id: subscriptions.id });

    return linked.length > 0 ? "linked" : "not_found";
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
}
