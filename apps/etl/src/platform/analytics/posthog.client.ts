import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PostHog } from "posthog-node";

import type { OutboundSurface, SubscriptionKind } from "./analytics.types";
import type { ProductAnalyticsEvent } from "./events";

type Provider = "telegram" | "google";
type DeactivationReason = "user" | "blocked" | "unreachable";

export interface ClickedVacancy {
  vacancyId: string;
  source?: string;
  company?: string;
}

// The only PostHog client in the process. Product code calls the verbs below,
// which keeps payload construction — and therefore accidental PII — out of
// feature modules. Raw capture() exists for AnalyticsService's personless
// events, which describe the system rather than a human.
@Injectable()
export class PostHogClient implements OnModuleDestroy {
  private readonly logger = new Logger(PostHogClient.name);
  private readonly client?: PostHog;
  private readonly isTest: boolean;

  constructor(config: ConfigService) {
    const key = config.get<string>("POSTHOG_API_KEY") ?? "";
    this.isTest = config.get<string>("ANALYTICS_TEST_TRAFFIC") === "true";
    if (!key) {
      // Env validation normally catches this. Keep the runtime boundary
      // fail-closed as well, so a partial ConfigService stub never ships data.
      this.logger.warn("POSTHOG_API_KEY is not set; product analytics capture is dormant.");
      return;
    }
    this.client = new PostHog(key, {
      host: config.get<string>("POSTHOG_HOST") ?? "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }

  accountCreated(personId: string, provider: Provider): void {
    this.captureProduct(personId, "account_created", { provider }, { has_account: true });
  }

  signedIn(personId: string, provider: Provider): void {
    this.captureProduct(personId, "signed_in", { provider });
  }

  subscriptionCreated(personId: string, subscriptionKind: SubscriptionKind): void {
    this.captureProduct(
      personId,
      "subscription_created",
      { subscription_kind: subscriptionKind },
      { subscription_kind: subscriptionKind, is_subscriber: true },
    );
  }

  // The Telegram chat is bound and the subscription is live. Nothing about this
  // act is visible from a URL — it happens inside Telegram.
  telegramLinked(personId: string, subscriptionKind: SubscriptionKind): void {
    this.captureProduct(
      personId,
      "telegram_linked",
      { subscription_kind: subscriptionKind },
      { subscription_kind: subscriptionKind, is_subscriber: true },
    );
  }

  digestSent(personId: string, subscriptionKind: SubscriptionKind): void {
    this.captureProduct(
      personId,
      "digest_sent",
      { subscription_kind: subscriptionKind },
      { subscription_kind: subscriptionKind, is_subscriber: true },
    );
  }

  vacancyOutboundClicked(
    personId: string,
    surface: OutboundSurface,
    vacancy: ClickedVacancy,
  ): void {
    this.captureProduct(personId, "vacancy_outbound_clicked", {
      surface,
      vacancy_id: vacancy.vacancyId,
      ...(vacancy.source ? { source: vacancy.source } : {}),
      ...(vacancy.company ? { company: vacancy.company } : {}),
    });
  }

  // One verb for every way a subscription stops, told apart by `reason`:
  // an explicit stop, a blocked bot, and a chat that stopped answering.
  subscriptionDeactivated(personId: string, reason: DeactivationReason): void {
    this.captureProduct(personId, "subscription_deactivated", { reason }, { is_subscriber: false });
  }

  // Merges the person a Telegram subscription carried before an account claimed
  // it into the account's person. PostHog cannot re-stitch retroactively, so
  // this has to be emitted at claim time or the two people stay two people.
  mergePerson(personId: string, previousPersonId: string): void {
    if (!personId || !previousPersonId || personId === previousPersonId) return;
    this.alias(personId, previousPersonId);
  }

  capture(distinctId: string, event: string, properties: Record<string, unknown>): void {
    if (!this.client || !distinctId) return;
    try {
      this.client.capture({ distinctId, event, properties });
    } catch (error) {
      this.logger.warn(`analytics capture failed: event=${event} ${describeError(error)}`);
    }
  }

  alias(distinctId: string, alias: string): void {
    if (!this.client) return;
    try {
      this.client.alias({ distinctId, alias });
    } catch (error) {
      this.logger.warn(`analytics alias failed: ${describeError(error)}`);
    }
  }

  private captureProduct(
    personId: string,
    event: ProductAnalyticsEvent,
    properties: Record<string, string>,
    // Written onto the person profile, which is how a Telegram-only subscriber
    // becomes a person PostHog can segment rather than a bare distinct id.
    personProperties?: Record<string, string | boolean>,
  ): void {
    this.capture(personId, event, {
      ...properties,
      is_test: this.isTest,
      ...(personProperties ? { $set: personProperties } : {}),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}

function describeError(error: unknown): string {
  return `error=${error instanceof Error ? error.message : String(error)}`;
}
