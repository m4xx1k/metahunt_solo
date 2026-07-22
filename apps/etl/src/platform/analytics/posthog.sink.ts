import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PostHog } from "posthog-node";

@Injectable()
export class PostHogSink implements OnModuleDestroy {
  private readonly logger = new Logger(PostHogSink.name);
  private readonly client?: PostHog;

  constructor(config: ConfigService) {
    const key = config.get<string>("POSTHOG_API_KEY") ?? "";
    if (key.length === 0) {
      this.logger.warn("POSTHOG_API_KEY not set — analytics provider dormant.");
      return;
    }
    this.client = new PostHog(key, {
      host: config.get<string>("POSTHOG_HOST"),
      flushAt: 1,
      flushInterval: 0,
    });
  }

  capture(distinctId: string, event: string, properties: Record<string, unknown>): void {
    try {
      this.client?.capture({ distinctId, event, properties });
    } catch (error) {
      this.logger.warn(
        `analytics sink capture failed: event=${event} error=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.shutdown();
  }
}
