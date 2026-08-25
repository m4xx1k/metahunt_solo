import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  SUBSCRIBER_IDENTITY_READER,
  type SubscriberIdentity,
  type SubscriberIdentityReader,
} from "./analytics.ports";
import type { OutboundSurface } from "./analytics.types";
import { ANALYTICS_EVENTS } from "./events";
import { PostHogClient, type ClickedVacancy } from "./posthog.client";

// The acts PostHog cannot be told about until an identity is resolved: an
// outbound click arrives as a subscription or a journey, never as a person.
// Everything else calls `PostHogClient` directly from the domain service.
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(SUBSCRIBER_IDENTITY_READER) private readonly identity: SubscriberIdentityReader,
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

  // One click, one verb (`vacancy_outbound_clicked`) told apart by `surface`.
  async applyClicked(
    vacancy: ClickedVacancy,
    subscriptionId?: string,
    journeyId?: string,
  ): Promise<void> {
    if (subscriptionId) {
      await this.captureOutboundClick(
        () => this.identity.subscriberForSubscription(subscriptionId),
        "telegram_digest",
        vacancy,
      );
      return;
    }
    if (journeyId) {
      await this.captureOutboundClick(
        () => this.identity.subscriberForJourney(journeyId),
        "web_feed",
        vacancy,
        journeyId,
      );
      return;
    }
    // A click we cannot name: no `?s=`, no `?j=`. The volume is real and worth
    // counting, but the id is not, so it gets its own verb and stays out of
    // every per-person metric — a synthetic distinct id counted as a human is
    // how "unique clickers" ends up higher than the number of people who exist.
    // Separate name, not just the flag: unattributed taps outnumber attributed
    // ones ~30:1, so sharing `vacancy_outbound_clicked` made the headline click
    // count meaningless unless every reader remembered to filter it.
    // No `surface`: a tap with no `?s=` and no `?j=` gives us nothing to infer
    // it from, and stamping "web_feed" on it made an unknown look like a fact.
    this.posthog.capture(randomUUID(), ANALYTICS_EVENTS.vacancyOutboundUnattributed, {
      vacancy_id: vacancy.vacancyId,
      ...(vacancy.source ? { source: vacancy.source } : {}),
      ...(vacancy.company ? { company: vacancy.company } : {}),
      is_anonymous: true,
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

  // A journey with two subscriptions names nobody, so it falls back to the
  // journey's own id, which IS its person id — an account claim merges the two
  // in PostHog by alias rather than by rewriting history.
  private async captureOutboundClick(
    resolve: () => Promise<SubscriberIdentity | null>,
    surface: OutboundSurface,
    vacancy: ClickedVacancy,
    journeyId?: string,
  ): Promise<void> {
    try {
      const subscriber = await resolve();
      const personId = subscriber?.personId ?? journeyId ?? null;
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
}

function describeError(error: unknown): string {
  return `error=${error instanceof Error ? error.message : String(error)}`;
}
