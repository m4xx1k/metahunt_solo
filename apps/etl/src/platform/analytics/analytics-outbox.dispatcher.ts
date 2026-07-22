import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";

import {
  ANALYTICS_OUTBOX_WRITER,
  ANALYTICS_SINK,
  type AnalyticsOutboxWriter,
  type AnalyticsSink,
} from "./analytics.ports";

const DISPATCH_INTERVAL_MS = 5_000;
const DISPATCH_BATCH_SIZE = 100;

@Injectable()
export class AnalyticsOutboxDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsOutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ANALYTICS_OUTBOX_WRITER) private readonly outbox: AnalyticsOutboxWriter,
    @Inject(ANALYTICS_SINK) private readonly sink: AnalyticsSink,
  ) {}

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
      let events;
      do {
        events = await this.outbox.drain(DISPATCH_BATCH_SIZE);
        for (const event of events) {
          this.sink.capture(event.journeyId, event.name, event.properties);
        }
      } while (events.length === DISPATCH_BATCH_SIZE);
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
