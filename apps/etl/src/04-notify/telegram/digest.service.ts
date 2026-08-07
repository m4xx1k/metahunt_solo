import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FeedService } from "../../03-discovery/feed/feed.service";
import { AnalyticsService } from "../../platform/analytics/analytics.service";

import { paginateDigest } from "./digest.renderer";
import { isChatUnreachable } from "./rate-limiter";
import { SentNotificationsService } from "./sent-notifications.service";
import { SubscriptionMatcherService } from "./subscription-matcher.service";
import { SubscriptionsService } from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

const DEFAULT_WEB_BASE_URL = "https://www.metahunt.app";
const MAX_VACANCY_MESSAGES_PER_DIGEST = 6;

// debugSend() pool: sampled from the freshest page, not the whole table — an
// admin poking the format doesn't need a full-table ORDER BY random() scan.
const DEBUG_SEND_POOL_SIZE = 50;
const DEBUG_SEND_DEFAULT_COUNT = 8;
const DEBUG_SEND_MAX_COUNT = 20;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Delivers a subscription's digest: match (via SubscriptionMatcherService) →
// page → send → record. Transport and persistence stay in their own services;
// this is the orchestration. Temporal-agnostic — the activity wraps it.
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly applyBaseUrl: string;
  private readonly webBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly matcher: SubscriptionMatcherService,
    private readonly subscriptions: SubscriptionsService,
    private readonly sentNotifications: SentNotificationsService,
    private readonly telegram: TelegramService,
    private readonly analytics: AnalyticsService,
    private readonly feed: FeedService,
  ) {
    this.applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
    this.webBaseUrl = this.config.get<string>("WEB_BASE_URL") ?? DEFAULT_WEB_BASE_URL;
  }

  // Match without sending — read-only debug hook, works on any (even unlinked) row.
  async preview(id: string): Promise<{ total: number; label: string; titles: string[] } | null> {
    const sub = await this.subscriptions.getMatchTarget(id);
    if (!sub) return null;
    const { items, total, label } = await this.matcher.matchNew(sub);
    return { total, label, titles: items.map((v) => v.title) };
  }

  /**
   * Deliver one subscription's digest. Skips silently when the subscription is
   * gone (deactivated mid-run) or has no new matches. Idempotent under Temporal
   * retry: the anti-join drops anything already recorded, so a failed page
   * resends only the remainder. The anti-join is chat-scoped (not just
   * subscription-scoped), so a chat with overlapping subscriptions gets any
   * given vacancy at most once per run. Returns total new matched.
   */
  async deliver(subscriptionId: string, evaluationId: string = randomUUID()): Promise<number> {
    const sub = await this.subscriptions.getActiveById(subscriptionId);
    if (!sub) return 0;

    const pendingDelivery = await this.sentNotifications.pendingDelivery(sub.id);
    const isFirstDigest =
      pendingDelivery?.isFirstDigest ??
      !(await this.sentNotifications.hasCompletedDelivery(sub.id));
    const { items, total, label } = await this.matcher.matchNew(sub, sub.chatId);
    const profileType = sub.candidateId ? "cv" : "feed";
    void this.analytics.digestEvaluated({
      subscriptionId: sub.id,
      matches: total,
      isFirstDigest,
      profileType,
      evaluationId: `digest_evaluated:${evaluationId}`,
    });
    if (total === 0) return 0;

    const remainingVacancies = pendingDelivery
      ? Math.max(pendingDelivery.vacancies - pendingDelivery.sentVacancies, 0)
      : items.length;
    const deliveryItems = items.slice(
      0,
      Math.min(remainingVacancies, MAX_VACANCY_MESSAGES_PER_DIGEST),
    );
    if (deliveryItems.length === 0) return 0;

    const pages = paginateDigest(deliveryItems, {
      totalNew: pendingDelivery?.vacancies ?? total,
      applyBaseUrl: this.applyBaseUrl,
      webBaseUrl: this.webBaseUrl,
      label,
      // `?s=<id>` lets the `/go/:id` redirect attribute clicks to this sub.
      subscriptionId: sub.id,
    });
    const delivery =
      pendingDelivery ??
      (await this.sentNotifications.createDelivery({
        id: digestDeliveryId(
          sub.id,
          pages.flatMap((page) => page.vacancyIds),
        ),
        subscriptionId: sub.id,
        vacancies: deliveryItems.length,
        matchedVacancies: total,
        pages: pages.length,
        isFirstDigest,
        profileType,
      }));
    let sentThisAttempt = 0;
    for (const [pageIndex, page] of pages.entries()) {
      try {
        const isFollowUpMessage = delivery.sentPages + pageIndex > 0;
        await this.telegram.sendMessage(sub.chatId, page.html, {
          disableNotification: isFollowUpMessage,
        });
        // Record after the send so a retried page never resends earlier ones.
        const completesDelivery =
          delivery.sentVacancies + sentThisAttempt + page.vacancyIds.length >= delivery.vacancies;
        await this.sentNotifications.record(sub.id, page.vacancyIds, delivery, completesDelivery);
        sentThisAttempt += page.vacancyIds.length;
      } catch (error) {
        const unreachable = isChatUnreachable(error);
        void this.analytics.digestDeliveryFailed({
          subscriptionId: sub.id,
          vacancies: delivery.vacancies,
          pages: delivery.pages,
          failedPage: delivery.sentPages + pageIndex + 1,
          deliveryId: delivery.id,
          failureKind: unreachable ? "chat_unreachable" : "transient",
          isFirstDigest: delivery.isFirstDigest,
          profileType: delivery.profileType,
        });
        // Safety net behind my_chat_member: enough consecutive bounces
        // deactivate the subscription instead of retrying it hourly forever.
        if (unreachable) void this.subscriptions.recordUnreachableDelivery(sub.id);
        throw error;
      }
    }
    void this.subscriptions.clearUnreachable(sub.id);

    this.logger.log(
      `digest → sub ${sub.id}: ${deliveryItems.length} new in ${pages.length} page(s)`,
    );
    return deliveryItems.length;
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

  /**
   * Admin-only format probe: sends real, randomly-sampled vacancies straight to
   * `chatId` through the same `paginateDigest` path the scheduled digest uses —
   * no subscription, no `sent_notifications` write, no anti-join. Safe to call
   * repeatedly while iterating on the card/pagination format.
   */
  async debugSend(chatId: string, count: number = DEBUG_SEND_DEFAULT_COUNT): Promise<number> {
    const capped = Math.min(Math.max(count, 1), DEBUG_SEND_MAX_COUNT);
    const pool = await this.feed.search({ page: 1, pageSize: DEBUG_SEND_POOL_SIZE });
    if (pool.items.length === 0) return 0;

    const items = shuffled(pool.items).slice(0, capped);
    const pages = paginateDigest(items, {
      totalNew: items.length,
      applyBaseUrl: this.applyBaseUrl,
      webBaseUrl: this.webBaseUrl,
    });
    for (const page of pages) {
      await this.telegram.sendMessage(chatId, page.html);
    }
    this.logger.log(`digest debug-send → chat ${chatId}: ${pages.length} message(s)`);
    return pages.length;
  }
}

function digestDeliveryId(subscriptionId: string, vacancyIds: string[]): string {
  return createHash("sha256")
    .update(`${subscriptionId}:${vacancyIds.join(",")}`)
    .digest("hex");
}
