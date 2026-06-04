import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PostHog } from "posthog-node";

import { ANALYTICS_EVENTS } from "./events";

/**
 * The single seam that knows about PostHog. Feature services call domain methods
 * (`subscriptionCreated`, `telegramLinked`, …); nothing else imports the SDK.
 *
 * Identity model — `subscription_uuid` is the cross-context join key:
 *  - web aliases its anonymous visitor onto `subscription_uuid` at create time;
 *  - the same uuid travels through the `/start <uuid>` deep link into Telegram;
 *  - on link we alias `subscription_uuid` onto the canonical human id
 *    `tg:<chat_id>`, so browser + Telegram collapse into one person.
 *  - a chat owns many subscriptions (many uuids) → `tg:<chat_id>` is the
 *    human-level id, `subscription_uuid` the per-subscription one.
 * When real auth lands later, `identify(user_id)` is just one more alias on the
 * same graph — the stitching here does not change.
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
    this.capture(uuid, ANALYTICS_EVENTS.subscriptionCreated, { params });
  }

  /** `/start <uuid>` bound a Telegram chat to the subscription. Bridges the
   * subscription person onto the canonical `tg:<chat_id>` human and stamps the
   * chat id as a person property (not an identity key). */
  telegramLinked(uuid: string, chatId: string, result: string): void {
    if (!this.client) return;
    this.client.alias({ distinctId: uuid, alias: `tg:${chatId}` });
    this.client.identify({
      distinctId: `tg:${chatId}`,
      properties: { chat_id: chatId },
    });
    this.capture(`tg:${chatId}`, ANALYTICS_EVENTS.telegramLinked, {
      uuid,
      result,
    });
  }

  /** A digest was delivered to a chat. Keyed on the canonical `tg:<chat_id>`
   * human so all of a chat's subscriptions roll up to one person. */
  digestSent(
    chatId: string,
    props: { subscriptionId: string; vacancies: number; pages: number },
  ): void {
    this.capture(`tg:${chatId}`, ANALYTICS_EVENTS.digestSent, props);
  }

  /** Apply link in a digest was tapped (server-side: the `/go/:id` redirect).
   * Keyed on the referring subscription uuid, which the alias has already
   * folded into the person — so the click lands on the right human. */
  applyClicked(subscriptionUuid: string, vacancyId: string): void {
    this.capture(subscriptionUuid, ANALYTICS_EVENTS.digestLinkClicked, {
      vacancyId,
    });
  }

  /** A chat unsubscribed — via `/stop` (all subscriptions) or the inline button
   * (one). `method` distinguishes them; `count`/`subscriptionId` give the scope. */
  unsubscribed(
    chatId: string,
    props: {
      method: "stop_command" | "button";
      subscriptionId?: string;
      count?: number;
    },
  ): void {
    this.capture(`tg:${chatId}`, ANALYTICS_EVENTS.unsubscribed, props);
  }

  private capture(
    distinctId: string,
    event: string,
    properties: Record<string, unknown>,
  ): void {
    this.client?.capture({ distinctId, event, properties });
  }

  async onModuleDestroy(): Promise<void> {
    // Flush any in-flight events so a shutdown doesn't drop the last captures.
    await this.client?.shutdown();
  }
}
