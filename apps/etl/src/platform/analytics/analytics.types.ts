import type { BrowserAnalyticsEventName, ProductEventSource } from "./events";

// Shared with the v2 contract in product-analytics.service.ts — the lookups
// that resolve a subscriber need these before the capture layer sees them.
export type SubscriptionKind = "feed" | "cv";
export type OutboundSurface = "web_feed" | "telegram_digest";

export interface BrowserProductEvent {
  journeyId: string;
  eventId: string;
  name: BrowserAnalyticsEventName;
  occurredAt: Date;
  properties: Record<string, unknown>;
}

export interface SubscriptionProductEvent {
  subscriptionId: string;
  name: string;
  source: ProductEventSource;
  dedupeKey: string;
  properties: Record<string, unknown>;
}

export interface DigestEvaluatedEvent {
  subscriptionId: string;
  matches: number;
  isFirstDigest: boolean;
  profileType: "feed" | "cv";
  evaluationId: string;
}

export interface DigestSentEvent {
  subscriptionId: string;
  vacancies: number;
  pages: number;
  deliveryId: string;
  isFirstDigest: boolean;
  profileType: "feed" | "cv";
}

export interface DigestDeliveryFailedEvent extends DigestSentEvent {
  failedPage: number;
  failureKind: "chat_unreachable" | "transient";
}

export interface UnsubscribedEvent {
  method: "stop_command" | "button" | "account";
  subscriptionId: string;
  count?: number;
}

export interface BotBlockedEvent {
  // chat_member = Telegram's my_chat_member update; delivery_failure = N
  // consecutive unreachable digest sends.
  method: "chat_member" | "delivery_failure";
  subscriptionId: string;
  count?: number;
}

export type ReactivationMethod = "account" | "unblock";
