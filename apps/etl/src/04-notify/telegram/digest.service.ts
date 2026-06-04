import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FeedService, type FeedSearchParams } from "../../03-discovery/feed/feed.service";
import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import { paginateDigest } from "./digest.renderer";
import { SentNotificationsService } from "./sent-notifications.service";
import {
  SubscriptionsService,
  type ActiveSubscription,
} from "./subscriptions.service";
import { TelegramService } from "./telegram.service";

const DAY_MS = 86_400_000;

// How far back the scheduled matcher scans. Correctness comes from the
// sent_notifications anti-join (never a watermark); this window is just a perf
// floor, also capped per-subscriber by `created_at` (no pre-subscription backlog).
const SCAN_WINDOW_DAYS = 14;

// Per-run ceiling on vacancies pulled for one subscription. The created_at floor
// keeps steady-state runs tiny; this only bounds a first run with a busy filter.
// Anything beyond rides the next run (still unsent within the window).
const MAX_VACANCIES_PER_RUN = 50;

/** Result of matching one subscription against the new-vacancy window. */
export interface DigestMatch {
  items: VacancyDto[];
  /** Full match count (may exceed `items.length` when capped). Drives the header. */
  total: number;
  /** Human filter label for the header. */
  label: string;
}

/**
 * Produces and delivers digests for a subscription: match new vacancies → page
 * → send → record. Pure transport (Telegram) and persistence
 * (subscriptions / sent-notifications) stay in their own services; this is the
 * orchestration. Temporal-agnostic — the activity is a thin wrapper over it.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly applyBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly feed: FeedService,
    private readonly subscriptions: SubscriptionsService,
    private readonly sentNotifications: SentNotificationsService,
    private readonly telegram: TelegramService,
  ) {
    this.applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
  }

  /**
   * Match the vacancies a subscription should be notified about now: loaded
   * after its candidate floor and not yet sent. Reuses the catalog search — no
   * separate matching logic.
   */
  async matchNew(sub: ActiveSubscription): Promise<DigestMatch> {
    const floor = this.candidateFloor(sub.createdAt);
    const excludeIds = await this.sentNotifications.sentVacancyIds(
      sub.id,
      floor,
    );
    const [page, label] = await Promise.all([
      this.feed.search({
        // Stored params are a feed query (whitelisted keys) — a JSON boundary.
        ...(sub.params as Partial<FeedSearchParams>),
        page: 1,
        pageSize: MAX_VACANCIES_PER_RUN,
        loadedAfter: floor,
        excludeIds,
      }),
      this.subscriptions.describe(sub.params),
    ]);
    return { items: page.items, total: page.total, label };
  }

  /**
   * Deliver one subscription's digest. Skips silently when the subscription is
   * gone (deactivated mid-run) or has no new matches — no empty digests.
   * Returns the number of new vacancies. Idempotent under Temporal retry: a
   * re-run re-matches and the anti-join drops anything already recorded, so a
   * failed page resends only the remainder. Returns total new matched.
   */
  async deliver(subscriptionId: string): Promise<number> {
    const sub = await this.subscriptions.getActiveById(subscriptionId);
    if (!sub) return 0;

    const { items, total, label } = await this.matchNew(sub);
    if (total === 0) return 0;

    const pages = paginateDigest(items, {
      totalNew: total,
      applyBaseUrl: this.applyBaseUrl,
      label,
    });
    for (const page of pages) {
      await this.telegram.sendMessage(sub.chatId, page.html);
      // Record per page, after the send, so a retried page never resends earlier ones.
      await this.sentNotifications.record(sub.id, page.vacancyIds);
    }

    this.logger.log(
      `digest → sub ${sub.id}: ${total} new in ${pages.length} page(s)`,
    );
    return total;
  }

  /**
   * Deliver to every active subscription directly (no Temporal). The scheduled
   * path goes through `notifySubscribersWorkflow`; this is the manual trigger —
   * a synchronous "re-send now" and the fast local-test hook. Returns counts.
   */
  async runForAllActive(): Promise<{ subscriptions: number; sent: number }> {
    const ids = await this.subscriptions.listActiveIds();
    let sent = 0;
    for (const id of ids) {
      sent += await this.deliver(id);
    }
    return { subscriptions: ids.length, sent };
  }

  // Never notify about vacancies that predate the subscription; never scan
  // further back than the window. Floor = the later of the two.
  private candidateFloor(createdAt: Date): Date {
    const windowStart = new Date(Date.now() - SCAN_WINDOW_DAYS * DAY_MS);
    return createdAt > windowStart ? createdAt : windowStart;
  }
}
