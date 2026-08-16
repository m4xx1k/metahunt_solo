import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PostHog } from "posthog-node";

import type { OutboundSurface, SubscriptionKind } from "./analytics.types";

type Provider = "telegram" | "google";
type DeactivationReason = "user" | "blocked" | "unreachable";

// This is the v2 contract. Keep it intentionally small: payload construction
// is not exposed to product features, which prevents accidental PII fields.
export const PRODUCT_ANALYTICS_EVENTS = [
  "$pageview",
  "account_created",
  "signed_in",
  "subscription_created",
  "digest_sent",
  "vacancy_outbound_clicked",
  "subscription_deactivated",
] as const;

type ProductAnalyticsEvent = (typeof PRODUCT_ANALYTICS_EVENTS)[number];

@Injectable()
export class ProductAnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(ProductAnalyticsService.name);
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
    this.capture(personId, "account_created", { provider }, { has_account: true });
  }

  signedIn(personId: string, provider: Provider): void {
    this.capture(personId, "signed_in", { provider });
  }

  subscriptionCreated(personId: string, subscriptionKind: SubscriptionKind): void {
    this.capture(
      personId,
      "subscription_created",
      { subscription_kind: subscriptionKind },
      { subscription_kind: subscriptionKind, is_subscriber: true },
    );
  }

  digestSent(personId: string, subscriptionKind: SubscriptionKind): void {
    this.capture(
      personId,
      "digest_sent",
      { subscription_kind: subscriptionKind },
      { subscription_kind: subscriptionKind, is_subscriber: true },
    );
  }

  vacancyOutboundClicked(personId: string, surface: OutboundSurface): void {
    this.capture(personId, "vacancy_outbound_clicked", { surface });
  }

  subscriptionDeactivated(personId: string, reason: DeactivationReason): void {
    this.capture(personId, "subscription_deactivated", { reason }, { is_subscriber: false });
  }

  // Merges the person a Telegram subscription carried before an account claimed
  // it into the account's person. PostHog cannot re-stitch retroactively, so
  // this has to be emitted at claim time or the two people stay two people.
  mergePerson(personId: string, previousPersonId: string): void {
    if (!this.client || !personId || !previousPersonId || personId === previousPersonId) return;
    try {
      this.client.alias({ distinctId: personId, alias: previousPersonId });
    } catch (error) {
      this.logger.warn(`Analytics person merge failed: ${describeError(error)}`);
    }
  }

  private capture(
    personId: string,
    event: ProductAnalyticsEvent,
    properties: Record<string, string>,
    // Written onto the person profile, which is how a Telegram-only subscriber
    // becomes a person PostHog can segment rather than a bare distinct id.
    personProperties?: Record<string, string | boolean>,
  ): void {
    if (!this.client || !personId) return;
    try {
      this.client.capture({
        distinctId: personId,
        event,
        properties: {
          ...properties,
          is_test: this.isTest,
          ...(personProperties ? { $set: personProperties } : {}),
        },
      });
    } catch (error) {
      this.logger.warn(`Analytics v2 capture failed: event=${event} ${describeError(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}

function describeError(error: unknown): string {
  return `error=${error instanceof Error ? error.message : String(error)}`;
}
