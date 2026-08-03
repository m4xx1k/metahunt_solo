import type { SubscriptionParams } from "./subscriptions.contract";

export interface CreateSubscriptionOptions {
  candidateId?: string;
  // A subscription is product state for an account. The public API supplies
  // this from its JWT; internal callers must do the same explicitly.
  userId: string;
  journeyId?: string;
}

export type LinkResult = "linked" | "already_active" | "duplicate" | "not_found";

// From Telegram's `from` field on the /start update. username is optional and
// mutable; firstName is the more durable human-readable identifier.
export interface TelegramLinkIdentity {
  userId?: string;
  username?: string | null;
  firstName?: string | null;
}

export interface SubscriptionMatchTarget {
  id: string;
  params: SubscriptionParams;
  candidateId: string | null;
  createdAt: Date;
}

export interface ActiveSubscription extends SubscriptionMatchTarget {
  chatId: string;
}
