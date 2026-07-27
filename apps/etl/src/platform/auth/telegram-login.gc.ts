import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";

import { TelegramLoginService } from "./telegram-login.service";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Login requests expire in 5 minutes and every query already filters on that,
// so this sweep is about size, not correctness — abandoned "log in" taps would
// otherwise accumulate forever.
@Injectable()
export class TelegramLoginGc implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramLoginGc.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly login: TelegramLoginService) {}

  onApplicationBootstrap(): void {
    void this.purge();
    this.timer = setInterval(() => void this.purge(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async purge(): Promise<void> {
    try {
      const removed = await this.login.purgeExpired();
      if (removed > 0) this.logger.log(`Purged ${removed} expired login request(s)`);
    } catch (err) {
      this.logger.error("Expired login-request purge failed", err);
    }
  }
}
