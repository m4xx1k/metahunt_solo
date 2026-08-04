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

  accountCreated(userId: string, provider: Provider): void {
    this.capture(userId, "account_created", { provider });
  }

  signedIn(userId: string, provider: Provider): void {
    this.capture(userId, "signed_in", { provider });
  }

  subscriptionCreated(userId: string, subscriptionKind: SubscriptionKind): void {
    this.capture(userId, "subscription_created", { subscription_kind: subscriptionKind });
  }

  digestSent(userId: string, subscriptionKind: SubscriptionKind): void {
    this.capture(userId, "digest_sent", { subscription_kind: subscriptionKind });
  }

  vacancyOutboundClicked(userId: string, surface: OutboundSurface): void {
    this.capture(userId, "vacancy_outbound_clicked", { surface });
  }

  subscriptionDeactivated(userId: string, reason: DeactivationReason): void {
    this.capture(userId, "subscription_deactivated", { reason });
  }

  private capture(
    userId: string,
    event: ProductAnalyticsEvent,
    properties: Record<string, string>,
  ): void {
    if (!this.client || !isUuid(userId)) return;
    try {
      this.client.capture({
        distinctId: userId,
        event,
        properties: { ...properties, is_test: this.isTest },
      });
    } catch (error) {
      this.logger.warn(
        `Analytics v2 capture failed: event=${event} error=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
