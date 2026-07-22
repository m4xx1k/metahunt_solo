import { randomUUID } from "node:crypto";

import { countObjectKeys } from "../shared/object-properties";

import type { ProductEventWrite } from "./analytics.ports";
import type {
  DigestSentEvent,
  SubscriptionProductEvent,
  UnsubscribedEvent,
} from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";

export function subscriptionCreatedEvent(
  subscriptionId: string,
  journeyId: string,
  params: unknown,
): ProductEventWrite {
  return {
    journeyId,
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
    dedupeKey: `unsubscribed:${props.subscriptionId}:${randomUUID()}`,
    properties: {
      method: props.method,
      ...(props.count === undefined ? {} : { count: props.count }),
    },
  };
}

export function subscriptionReactivatedEvent(subscriptionId: string): SubscriptionProductEvent {
  return {
    subscriptionId,
    name: ANALYTICS_EVENTS.subscriptionReactivated,
    source: "api",
    dedupeKey: `subscription_reactivated:${subscriptionId}:${randomUUID()}`,
    properties: { method: "account" },
  };
}

export function withInsertId(event: ProductEventWrite): ProductEventWrite {
  return {
    ...event,
    properties: { ...event.properties, $insert_id: event.dedupeKey },
  };
}
