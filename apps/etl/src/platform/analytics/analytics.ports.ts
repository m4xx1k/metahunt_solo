import type { SubscriptionKind } from "./analytics.types";

export const SUBSCRIBER_IDENTITY_READER = Symbol("SUBSCRIBER_IDENTITY_READER");

// The identity of a subscriber: `subscriptions.person_id`. Every subscription
// has one from birth, and claiming an account rewrites it to `users.id` — so a
// Telegram-only subscriber is a person on day one, not on the day they sign in.
export interface SubscriberIdentity {
  personId: string;
  subscriptionKind: SubscriptionKind;
}

// Resolving who a PostHog event belongs to. Nothing here writes: since the
// ledger retired, `PostHogClient` is the only writer of an analytics fact.
export interface SubscriberIdentityReader {
  subscriberForSubscription(subscriptionId: string): Promise<SubscriberIdentity | null>;
  subscriberForJourney(journeyId: string): Promise<SubscriberIdentity | null>;
}
