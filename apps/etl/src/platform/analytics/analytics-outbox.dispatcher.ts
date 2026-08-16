import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";

import { ANALYTICS_OUTBOX_WRITER, type AnalyticsOutboxWriter } from "./analytics.ports";

const DISPATCH_INTERVAL_MS = 5_000;
const DISPATCH_BATCH_SIZE = 100;

// Drains the outbox into the Postgres ledger. It deliberately does not talk to
// PostHog: one fact may be written to both stores, but never by two authors —
// PostHogClient is the writer on that side. When the ledger retires this
// becomes the PostHog delivery buffer instead (tracker: analytics-one-identity).
@Injectable()
export class AnalyticsOutboxDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsOutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(ANALYTICS_OUTBOX_WRITER) private readonly outbox: AnalyticsOutboxWriter) {}

  onApplicationBootstrap(): void {
    void this.dispatch();
    this.timer = setInterval(() => void this.dispatch(), DISPATCH_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let drained = 0;
      do {
        drained = (await this.outbox.drain(DISPATCH_BATCH_SIZE)).length;
      } while (drained === DISPATCH_BATCH_SIZE);
    } catch (error) {
      this.logger.error(
        "analytics outbox dispatch failed; pending rows will retry",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
