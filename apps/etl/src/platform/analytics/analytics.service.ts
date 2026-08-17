import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  ANALYTICS_OUTBOX_WRITER,
  PRODUCT_EVENT_WRITER,
  type AnalyticsExecutor,
  type AnalyticsOutboxWriter,
  type ProductEventWrite,
  type ProductEventWriter,
  type SubscriberIdentity,
} from "./analytics.ports";
import type {
  BotBlockedEvent,
  DigestDeliveryFailedEvent,
  DigestEvaluatedEvent,
  DigestSentEvent,
  OutboundSurface,
  ReactivationMethod,
  SubscriptionProductEvent,
  UnsubscribedEvent,
} from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";
import { PostHogClient, type ClickedVacancy } from "./posthog.client";
import {
  botBlockedEvent,
  digestSentEvent,
  subscriptionCreatedEvent,
  subscriptionReactivatedEvent,
  telegramLinkedEvent,
  unsubscribedEvent,
  withInsertId,
} from "./product-event.factory";

// Domain-shaped writes to the Postgres ledger, plus the PostHog verbs that
// belong to the same act. Every early return here logs: an analytics path that
// drops an event in silence is how a dashboard ends up confidently wrong.
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(PRODUCT_EVENT_WRITER) private readonly events: ProductEventWriter,
    @Inject(ANALYTICS_OUTBOX_WRITER) private readonly outbox: AnalyticsOutboxWriter,
    private readonly posthog: PostHogClient,
  ) {}

  // A browser journey and the person who owns it are the same human. Called
  // when a subscription is created from the web, which is the only moment the
  // two ids are known together.
  aliasJourneyToPerson(journeyId: string, personId: string): void {
    this.posthog.mergePerson(personId, journeyId);
  }

  aliasPerson(sourcePersonId: string, targetPersonId: string): void {
    this.posthog.mergePerson(targetPersonId, sourcePersonId);
  }

  async subscriptionCreated(subscriptionId: string, params: unknown): Promise<void> {
    await this.enqueueSubscriptionEvent(subscriptionCreatedEvent(subscriptionId, params));
  }

  async telegramLinked(subscriptionId: string, result: string): Promise<void> {
    await this.enqueueSubscriptionEvent(telegramLinkedEvent(subscriptionId, result));
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

  // One click, one PostHog verb (`vacancy_outbound_clicked`) told apart by
  // `surface`. The ledger still keeps its own two names until it retires.
  async applyClicked(
    vacancy: ClickedVacancy,
    subscriptionId?: string,
    journeyId?: string,
  ): Promise<void> {
    const properties = {
      vacancy_id: vacancy.vacancyId,
      ...(vacancy.source ? { source: vacancy.source } : {}),
      ...(vacancy.company ? { company: vacancy.company } : {}),
    };
    if (subscriptionId) {
      await this.enqueueSubscriptionEvent({
        subscriptionId,
        name: ANALYTICS_EVENTS.digestLinkClicked,
        source: "api",
        // A click is not idempotent by construction — two taps are two clicks.
        // The key exists to make one call's retries one row, nothing more.
        dedupeKey: `digest_link_clicked:${randomUUID()}`,
        properties: { ...properties, surface: "telegram_digest" },
      });
      await this.captureOutboundClick(
        () => this.events.subscriberForSubscription(subscriptionId),
        "telegram_digest",
        vacancy,
      );
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
          properties: { ...properties, surface: "web_feed" },
        });
      } catch {
        // Already logged by record(); swallow so the redirect (already sent
        // by the caller) is never affected by an analytics-write failure.
      }
      await this.captureOutboundClick(
        () => this.events.subscriberForJourney(journeyId),
        "web_feed",
        vacancy,
        journeyId,
      );
      return;
    }
    this.posthog.capture(randomUUID(), ANALYTICS_EVENTS.vacancyOutboundClicked, {
      ...properties,
      surface: "web_feed",
      $process_person_profile: false,
    });
  }

  // Threshold-calibration telemetry (coverage histogram + tier counts) —
  // PostHog-only, personless: it describes the scoring, not a user journey.
  matchScored(properties: Record<string, number | number[]>): void {
    this.posthog.capture(randomUUID(), ANALYTICS_EVENTS.matchScored, {
      ...properties,
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

  async subscriptionReactivated(
    subscriptionId: string,
    method: ReactivationMethod = "account",
  ): Promise<void> {
    await this.enqueueSubscriptionEvent(subscriptionReactivatedEvent(subscriptionId, method));
  }

  async enqueueSubscriptionReactivated(
    executor: AnalyticsExecutor,
    subscriptionId: string,
    journeyId: string,
    method: ReactivationMethod = "account",
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...subscriptionReactivatedEvent(subscriptionId, method), journeyId }),
      executor,
    );
  }

  async botBlocked(props: BotBlockedEvent): Promise<void> {
    await this.enqueueSubscriptionEvent(botBlockedEvent(props));
  }

  async enqueueBotBlocked(
    executor: AnalyticsExecutor,
    props: BotBlockedEvent & { journeyId: string },
  ): Promise<void> {
    await this.outbox.enqueue(
      withInsertId({ ...botBlockedEvent(props), journeyId: props.journeyId }),
      executor,
    );
  }

  // The PostHog half of an outbound click. A journey with two subscriptions
  // names nobody, so it falls back to the journey's own person rather than
  // guessing — and a stand-in id is what turned every click into its own
  // person in the old project.
  private async captureOutboundClick(
    resolve: () => Promise<SubscriberIdentity | null>,
    surface: OutboundSurface,
    vacancy: ClickedVacancy,
    journeyId?: string,
  ): Promise<void> {
    try {
      const subscriber = await resolve();
      const personId =
        subscriber?.personId ?? (journeyId ? await this.events.personForJourney(journeyId) : null);
      if (!personId) {
        this.logger.warn(`outbound click has no person: surface=${surface}`);
        return;
      }
      this.posthog.vacancyOutboundClicked(personId, surface, vacancy);
    } catch (error) {
      this.logger.warn(
        `outbound click identity lookup failed: surface=${surface} ${describeError(error)}`,
      );
    }
  }

  private async enqueueSubscriptionEvent(event: SubscriptionProductEvent): Promise<void> {
    try {
      const journeyId = await this.events.journeyForSubscription(event.subscriptionId);
      if (!journeyId) {
        this.logger.warn(
          `product event dropped, no journey: event=${event.name} subscription=${event.subscriptionId}`,
        );
        return;
      }
      await this.enqueue({ ...event, journeyId });
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
    try {
      await this.events.record(withInsertId(event));
    } catch (error) {
      this.logPersistenceFailure(event.name, event.journeyId, error);
      throw error;
    }
  }

  private logPersistenceFailure(eventName: string, correlationId: string, error: unknown): void {
    this.logger.error(
      `product event persistence failed: event=${eventName} correlation=${correlationId}`,
      error instanceof Error ? error.stack : undefined,
    );
  }
}

function describeError(error: unknown): string {
  return `error=${error instanceof Error ? error.message : String(error)}`;
}
