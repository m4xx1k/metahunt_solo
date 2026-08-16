import { countObjectKeys } from "../shared/object-properties";

import type { ProductEventWrite } from "./analytics.ports";
import type {
  BotBlockedEvent,
  DigestSentEvent,
  ReactivationMethod,
  SubscriptionProductEvent,
  UnsubscribedEvent,
} from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";

export function subscriptionCreatedEvent(
  subscriptionId: string,
  params: unknown,
): SubscriptionProductEvent {
  return {
    subscriptionId,
    name: ANALYTICS_EVENTS.subscriptionCreated,
    source: "api",
    dedupeKey: `subscription_created:${subscriptionId}`,
    properties: { filterCount: countObjectKeys(params) },
  };
}

export function telegramLinkedEvent(
  subscriptionId: string,
  result: string,
): SubscriptionProductEvent {
  return {
    subscriptionId,
    name: ANALYTICS_EVENTS.telegramLinked,
    source: "telegram",
    dedupeKey: `telegram_linked:${subscriptionId}:${result}`,
    properties: { result },
  };
}

export function digestSentEvent(props: DigestSentEvent): SubscriptionProductEvent {
  return {
    subscriptionId: props.subscriptionId,
    name: ANALYTICS_EVENTS.digestSent,
    source: "worker",
    dedupeKey: props.deliveryId,
    properties: {
      vacancies: props.vacancies,
      pages: props.pages,
      is_first_digest: props.isFirstDigest,
      profile_type: props.profileType,
    },
  };
}

export function unsubscribedEvent(props: UnsubscribedEvent): SubscriptionProductEvent {
  return {
    subscriptionId: props.subscriptionId,
    name: ANALYTICS_EVENTS.unsubscribed,
    source: props.method === "account" ? "api" : "telegram",
    dedupeKey: `unsubscribed:${props.subscriptionId}:${utcDay()}`,
    properties: {
      method: props.method,
      ...(props.count === undefined ? {} : { count: props.count }),
    },
  };
}

export function subscriptionReactivatedEvent(
  subscriptionId: string,
  method: ReactivationMethod = "account",
): SubscriptionProductEvent {
  return {
    subscriptionId,
    name: ANALYTICS_EVENTS.subscriptionReactivated,
    source: method === "account" ? "api" : "telegram",
    dedupeKey: `subscription_reactivated:${subscriptionId}:${utcDay()}`,
    properties: { method },
  };
}

export function botBlockedEvent(props: BotBlockedEvent): SubscriptionProductEvent {
  return {
    subscriptionId: props.subscriptionId,
    name: ANALYTICS_EVENTS.botBlocked,
    source: "telegram",
    dedupeKey: `bot_blocked:${props.subscriptionId}:${utcDay()}`,
    properties: {
      method: props.method,
      ...(props.count === undefined ? {} : { count: props.count }),
    },
  };
}

// A subscription can only be stopped, restarted or blocked once on a given
// day — it has to pass through the opposite state first. That makes the day a
// safe dedupe grain, where a fresh UUID made the guarantee decorative.
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function withInsertId(event: ProductEventWrite): ProductEventWrite {
  return {
    ...event,
    properties: { ...event.properties, $insert_id: event.dedupeKey },
  };
}
