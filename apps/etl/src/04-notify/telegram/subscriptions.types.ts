import type { SubscriptionParams } from "./subscriptions.contract";

export interface CreateSubscriptionOptions {
  candidateId?: string;
  userId?: string;
  journeyId?: string;
}

export type LinkResult = "linked" | "already_active" | "duplicate" | "not_found";

export interface SubscriptionMatchTarget {
  id: string;
  params: SubscriptionParams;
  candidateId: string | null;
  createdAt: Date;
}

export interface ActiveSubscription extends SubscriptionMatchTarget {
  chatId: string;
}
