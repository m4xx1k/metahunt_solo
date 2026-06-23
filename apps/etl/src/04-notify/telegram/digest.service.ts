import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import { paginateDigest } from "./digest.renderer";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionMatcherService } from "./subscription-matcher.service";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

// Delivers a subscription's digest: match (via SubscriptionMatcherService) →
// page → send → record. Transport and persistence stay in their own services;
// this is the orchestration. Temporal-agnostic — the activity wraps it.
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly applyBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly matcher: SubscriptionMatcherService,
    private readonly subscriptions: SubscriptionsService,
    private readonly sentNotifications: SentNotificationsService,
    private readonly telegram: TelegramService,
    private readonly analytics: AnalyticsService,
  ) {
    this.applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
  }

  // Match without sending — read-only debug hook, works on any (even unlinked) row.
  async preview(
    id: string,
  ): Promise<{ total: number; label: string; titles: string[] } | null> {
    const sub = await this.subscriptions.getMatchTarget(id);
    if (!sub) return null;
    const { items, total, label } = await this.matcher.matchNew(sub);
    return { total, label, titles: items.map((v) => v.title) };
  }

  /**
   * Deliver one subscription's digest. Skips silently when the subscription is
   * gone (deactivated mid-run) or has no new matches. Idempotent under Temporal
   * retry: the anti-join drops anything already recorded, so a failed page
   * resends only the remainder. Returns total new matched.
   */
  async deliver(subscriptionId: string): Promise<number> {
    const sub = await this.subscriptions.getActiveById(subscriptionId);
    if (!sub) return 0;

    const { items, total, label } = await this.matcher.matchNew(sub);
    if (total === 0) return 0;

    const pages = paginateDigest(items, {
      totalNew: total,
      applyBaseUrl: this.applyBaseUrl,
      label,
      // `?s=<id>` lets the `/go/:id` redirect attribute clicks to this sub.
      subscriptionId: sub.id,
    });
    for (const page of pages) {
      await this.telegram.sendMessage(sub.chatId, page.html);
      // Record after the send so a retried page never resends earlier ones.
      await this.sentNotifications.record(sub.id, page.vacancyIds);
    }

    this.analytics.digestSent(sub.chatId, {
      subscriptionId: sub.id,
      vacancies: total,
      pages: pages.length,
    });
    this.logger.log(
      `digest → sub ${sub.id}: ${total} new in ${pages.length} page(s)`,
    );
    return total;
  }

  /**
   * Deliver to every active subscription directly (no Temporal) — the manual
   * trigger. Per-sub failures are isolated so one blocked chat doesn't abort
   * the rest, matching notifySubscribersWorkflow's resilience.
   */
  async runForAllActive(): Promise<{ subscriptions: number; sent: number }> {
    const ids = await this.subscriptions.listActiveIds();
    let sent = 0;
    for (const id of ids) {
      try {
        sent += await this.deliver(id);
      } catch (err) {
        this.logger.warn(
          `digest delivery failed for sub ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { subscriptions: ids.length, sent };
  }
}
