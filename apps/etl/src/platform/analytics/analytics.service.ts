import { randomUUID } from "node:crypto";

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
    // Direction matters: the canonical `tg:<chat_id>` must be the `distinctId`
    // (merge target) and the fresh subscription uuid the `alias` (merge source).
    // PostHog rejects `$create_alias` when the `alias` value is already an
    // identified distinct_id — so putting tg:<chat_id> there only works for a
    // chat's FIRST subscription and silently drops every later one. The uuid is
    // always new, so it merges every time, however many subscriptions a chat has.
    this.client.alias({ distinctId: `tg:${chatId}`, alias: uuid });
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
