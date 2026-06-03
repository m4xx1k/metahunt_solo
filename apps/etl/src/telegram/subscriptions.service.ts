import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DRIZZLE, schema } from "@metahunt/database";
import type { DrizzleDB } from "@metahunt/database";

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
