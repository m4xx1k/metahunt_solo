import { randomUUID } from "node:crypto";

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PostHog } from "posthog-node";

import { ANALYTICS_EVENTS } from "./events";

/**
 * The single seam that knows about PostHog. Feature services call domain methods
 * (`subscriptionCreated`, `telegramLinked`, …); nothing else imports the SDK.
 *
 * Server events use an opaque subscription UUID. Raw chat identifiers and
 * subscription filters never leave the application.
 *
 * Dormant when POSTHOG_API_KEY is unset: every method is a no-op (see env
 * validation), so local/test/CI ship nothing. All calls are fire-and-forget —
 * an analytics hiccup must never break a subscription or a digest.
 */
@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly client?: PostHog;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>("POSTHOG_API_KEY") ?? "";
    if (key.length === 0) {
      this.logger.warn("POSTHOG_API_KEY not set — analytics dormant (no-op).");
      return;
    }
    // Server is long-lived; flush each event immediately rather than batching so
    // nothing is lost if a worker is recycled between low-traffic events.
    this.client = new PostHog(key, {
      host: this.config.get<string>("POSTHOG_HOST"),
      flushAt: 1,
      flushInterval: 0,
    });
  }

  /** Web facet filter turned into a pending subscription. Keyed on the uuid so
   * the web-side `alias(uuid)` collapses the anonymous visitor into this person. */
  subscriptionCreated(uuid: string, params: unknown): void {
    this.capture(uuid, ANALYTICS_EVENTS.subscriptionCreated, {
      filterCount: countFilterKeys(params),
      $insert_id: `subscription_created:${uuid}`,
    });
  }

  telegramLinked(uuid: string, result: string): void {
    this.capture(uuid, ANALYTICS_EVENTS.telegramLinked, {
      result,
      $insert_id: `telegram_linked:${uuid}:${result}`,
    });
  }

  digestSent(props: {
    subscriptionId: string;
    vacancies: number;
    pages: number;
    deliveryId: string;
  }): void {
    this.capture(props.subscriptionId, ANALYTICS_EVENTS.digestSent, {
      vacancies: props.vacancies,
      pages: props.pages,
      $insert_id: props.deliveryId,
    });
  }

  /** Apply link tapped via the `/go/:id` redirect. A `?s=` digest tap stays on
   * the historical `digest_link_clicked` event (keyed on that uuid the alias has
   * folded into the person) so the live funnel is untouched. An anonymous web tap
   * emits `apply_clicked` with `$process_person_profile: false` — every apply is
   * counted without minting a throwaway person per click. */
  applyClicked(vacancyId: string, subscriptionUuid?: string): void {
    if (subscriptionUuid) {
      this.capture(subscriptionUuid, ANALYTICS_EVENTS.digestLinkClicked, {
        vacancyId,
      });
      return;
    }
    this.capture(randomUUID(), ANALYTICS_EVENTS.applyClicked, {
      vacancyId,
      $process_person_profile: false,
    });
  }

  unsubscribed(props: {
    method: "stop_command" | "button";
    subscriptionId?: string;
    count?: number;
  }): void {
    const distinctId = props.subscriptionId ?? randomUUID();
    this.capture(distinctId, ANALYTICS_EVENTS.unsubscribed, {
      method: props.method,
      ...(props.count === undefined ? {} : { count: props.count }),
      ...(props.subscriptionId === undefined ? { $process_person_profile: false } : {}),
      $insert_id: `unsubscribed:${distinctId}`,
    });
  }

  private capture(distinctId: string, event: string, properties: Record<string, unknown>): void {
    this.client?.capture({ distinctId, event, properties });
  }

  async onModuleDestroy(): Promise<void> {
    // Flush any in-flight events so a shutdown doesn't drop the last captures.
    await this.client?.shutdown();
  }
}

function countFilterKeys(params: unknown): number {
  if (typeof params !== "object" || params === null || Array.isArray(params)) return 0;
  return Object.keys(params).length;
}
