import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SubscriptionsService } from "./subscriptions.service";

// Orphan pending rows (web "Subscribe" tapped, never `/start`-ed) are swept once
// they're older than this. Generous enough that a user can subscribe and open
// Telegram minutes or hours later; tight enough that abandoned taps don't pile up.
const PENDING_TTL_HOURS = 48;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Background GC for abandoned web "Subscribe" taps. An in-process interval (not
// Temporal) deliberately: it only runs where the bot does — and the bot's
// long-poller already pins the etl service to one replica, so this timer is
// single-instance too. No token → no `POST /subscriptions` → no pending rows to
// sweep, so we don't even start the timer.
@Injectable()
export class PendingSubscriptionsGc
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PendingSubscriptionsGc.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onApplicationBootstrap(): void {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (token.length === 0) return;

    void this.purge();
    this.cleanupTimer = setInterval(() => void this.purge(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async purge(): Promise<void> {
    try {
      const removed =
        await this.subscriptions.purgeStalePending(PENDING_TTL_HOURS);
      if (removed > 0) {
        this.logger.log(`Purged ${removed} stale pending subscription(s)`);
      }
    } catch (err) {
      this.logger.error("Stale-subscription purge failed", err);
    }
  }
}
