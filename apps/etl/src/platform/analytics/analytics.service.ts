import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  ANALYTICS_OUTBOX_WRITER,
  ANALYTICS_SINK,
  PRODUCT_EVENT_WRITER,
  type AnalyticsExecutor,
  type AnalyticsOutboxWriter,
  type AnalyticsSink,
  type ProductEventWrite,
  type ProductEventWriter,
} from "./analytics.ports";
import type {
  BrowserProductEvent,
  DigestDeliveryFailedEvent,
  DigestEvaluatedEvent,
  DigestSentEvent,
  SubscriptionProductEvent,
  UnsubscribedEvent,
} from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";
import {
  digestSentEvent,
  subscriptionCreatedEvent,
  subscriptionReactivatedEvent,
  telegramLinkedEvent,
  unsubscribedEvent,
  withInsertId,
} from "./product-event.factory";

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(PRODUCT_EVENT_WRITER) private readonly events: ProductEventWriter,
    @Inject(ANALYTICS_OUTBOX_WRITER) private readonly outbox: AnalyticsOutboxWriter,
    @Inject(ANALYTICS_SINK) private readonly posthog: AnalyticsSink,
  ) {}

  async browserEvent(event: BrowserProductEvent): Promise<void> {
    await this.record({
      journeyId: event.journeyId,
      name: event.name,
      source: "browser",
      dedupeKey: `browser:${event.eventId}`,
      occurredAt: event.occurredAt,
      properties: event.properties,
    });
  }

  async subscriptionCreated(
    subscriptionId: string,
    journeyId: string,
    params: unknown,
  ): Promise<void> {
    await this.enqueue(subscriptionCreatedEvent(subscriptionId, journeyId, params));
  }

  async enqueueSubscriptionCreated(
    executor: AnalyticsExecutor,
    subscriptionId: string,
    journeyId: string,
    params: unknown,
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId(subscriptionCreatedEvent(subscriptionId, journeyId, params)),
      executor,
    );
  }

  async telegramLinked(subscriptionId: string, result: string): Promise<void> {
    await this.enqueueSubscriptionEvent(telegramLinkedEvent(subscriptionId, result));
  }

  async enqueueTelegramLinked(
    executor: AnalyticsExecutor,
    subscriptionId: string,
    journeyId: string,
    result: string,
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...telegramLinkedEvent(subscriptionId, result), journeyId }),
      executor,
    );
  }

  async activationValueShown(
    subscriptionId: string,
    matches: number,
    shown: number,
  ): Promise<void> {
    await this.enqueueSubscriptionEvent({
      subscriptionId,
      name: ANALYTICS_EVENTS.activationValueShown,
      source: "telegram",
      dedupeKey: `activation_value_shown:${subscriptionId}`,
      properties: {
        matches,
        shown,
        result: matches > 0 ? "matches" : "empty",
      },
    });
  }

  async digestEvaluated(props: DigestEvaluatedEvent): Promise<void> {
    await this.enqueueSubscriptionEvent({
      subscriptionId: props.subscriptionId,
      name: ANALYTICS_EVENTS.digestEvaluated,
      source: "worker",
      dedupeKey: props.evaluationId,
      properties: {
        matches: props.matches,
        result: props.matches > 0 ? "matches" : "empty",
        is_first_digest: props.isFirstDigest,
        profile_type: props.profileType,
      },
    });
  }

  async digestSent(props: DigestSentEvent): Promise<void> {
    await this.enqueueSubscriptionEvent(digestSentEvent(props));
  }

  async enqueueDigestSent(
    executor: AnalyticsExecutor,
    props: DigestSentEvent & { journeyId: string },
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...digestSentEvent(props), journeyId: props.journeyId }),
      executor,
    );
  }

  async digestDeliveryFailed(props: DigestDeliveryFailedEvent): Promise<void> {
    await this.enqueueSubscriptionEvent({
      subscriptionId: props.subscriptionId,
      name: ANALYTICS_EVENTS.digestDeliveryFailed,
      source: "worker",
      dedupeKey: `digest_delivery_failed:${props.deliveryId}:${props.failedPage}`,
      properties: {
        vacancies: props.vacancies,
        pages: props.pages,
        failed_page: props.failedPage,
        failure_kind: props.failureKind,
        is_first_digest: props.isFirstDigest,
        profile_type: props.profileType,
      },
    });
  }

  async applyClicked(
    vacancyId: string,
    subscriptionId?: string,
    journeyId?: string,
  ): Promise<void> {
    if (subscriptionId) {
      const clickId = randomUUID();
      await this.enqueueSubscriptionEvent({
        subscriptionId,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api",
        dedupeKey: `digest_link_clicked:${clickId}`,
        properties: { vacancyId },
      });
      return;
    }
    if (journeyId) {
      // Feed clicks land at journey level (a journey can have zero or many
      // subscriptions); roll up to a subscriber downstream only when the
      // journey has exactly one.
      try {
        await this.record({
          journeyId,
          name: ANALYTICS_EVENTS.applyClicked,
          source: "browser",
          dedupeKey: `apply_clicked:${randomUUID()}`,
          properties: { vacancyId },
        });
      } catch {
        // Already logged by record(); swallow so the redirect (already sent
        // by the caller) is never affected by an analytics-write failure.
      }
      return;
    }
    this.posthog.capture(randomUUID(), ANALYTICS_EVENTS.applyClicked, {
      vacancyId,
      $process_person_profile: false,
    });
  }

  async unsubscribed(props: UnsubscribedEvent): Promise<void> {
    await this.enqueueSubscriptionEvent(unsubscribedEvent(props));
  }

  async enqueueUnsubscribed(
    executor: AnalyticsExecutor,
    props: UnsubscribedEvent & { journeyId: string },
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...unsubscribedEvent(props), journeyId: props.journeyId }),
      executor,
    );
  }

  async subscriptionReactivated(subscriptionId: string): Promise<void> {
    await this.enqueueSubscriptionEvent(subscriptionReactivatedEvent(subscriptionId));
  }

  async enqueueSubscriptionReactivated(
    executor: AnalyticsExecutor,
    subscriptionId: string,
    journeyId: string,
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...subscriptionReactivatedEvent(subscriptionId), journeyId }),
      executor,
    );
  }

  private async enqueueSubscriptionEvent(event: SubscriptionProductEvent): Promise<void> {
    try {
      const journeyId = await this.events.journeyForSubscription(event.subscriptionId);
      if (journeyId) await this.enqueue({ ...event, journeyId });
    } catch (error) {
      this.logPersistenceFailure(event.name, event.subscriptionId, error);
    }
  }

  private async enqueue(event: ProductEventWrite): Promise<void> {
    try {
      await this.outbox.enqueue(withInsertId(event));
    } catch (error) {
      this.logPersistenceFailure(event.name, event.journeyId, error);
    }
  }

  private async record(event: ProductEventWrite): Promise<void> {
    const durableEvent = withInsertId(event);
    try {
      await this.events.record(durableEvent);
    } catch (error) {
      this.logPersistenceFailure(event.name, event.journeyId, error);
      throw error;
    }
    this.posthog.capture(event.journeyId, event.name, durableEvent.properties);
  }

  private logPersistenceFailure(eventName: string, correlationId: string, error: unknown): void {
    this.logger.error(
      `product event persistence failed: event=${eventName} correlation=${correlationId}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}
