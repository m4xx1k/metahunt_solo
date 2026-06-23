import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";

import { RateLimiter, withRetryAfter } from "./rate-limiter";
import { TelegramCommandsHandler } from "./telegram-commands.handler";
import { BOT_COMMANDS } from "./telegram-copy";

// Telegram caps outbound at ~30 msg/s globally; stay comfortably under it.
const SEND_INTERVAL_MS = 50; // ≈20 msg/s
// A burst to one chat can still trip a per-chat 429 — honor its retry_after
// rather than burning the activity's Temporal attempts on a transient limit.
const SEND_MAX_RETRIES = 2;

// grammy long-polling is single-consumer: this service must run in exactly ONE
// `@metahunt/etl` replica. Keep the etl service pinned to 1 replica on Railway,
// or extract the poller before scaling the worker horizontally.
//
// Transport only: owns the bot's lifecycle (poller) and the stateless outbound
// `sendMessage`. Inbound commands live in `TelegramCommandsHandler`.
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly limiter = new RateLimiter(SEND_INTERVAL_MS);
  private bot?: Bot;

  constructor(
    private readonly config: ConfigService,
    private readonly commands: TelegramCommandsHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (token.length === 0) {
      this.logger.warn(
        "TELEGRAM_BOT_TOKEN not set — Telegram bot is dormant (no poller).",
      );
      return;
    }

    const bot = new Bot(token);
    // Handlers must be wired before the poller starts, or early updates are lost.
    this.commands.register(bot);

    // init() runs getMe so `botInfo.username` is available to the subscribe
    // endpoint without a separate env var. A bad token fails here — log and
    // stay dormant rather than crashing bootstrap.
    try {
      await bot.init();
    } catch (err) {
      this.logger.error("Telegram bot init failed — bot dormant", err);
      return;
    }
    this.bot = bot;

    // Publish the native command menu from the single registry. Non-fatal: a
    // failure here shouldn't keep the poller from starting.
    try {
      await bot.api.setMyCommands([...BOT_COMMANDS]);
    } catch (err) {
      this.logger.warn("Telegram setMyCommands failed", err);
    }

    // bot.start() resolves only when the bot stops, so we deliberately don't
    // await it — that would block Nest bootstrap forever.
    void bot.start({
      onStart: (me) => this.logger.log(`Telegram bot @${me.username} polling`),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot?.stop();
  }

  /** Bot @username (from getMe), once initialized. Undefined while dormant. */
  get botUsername(): string | undefined {
    return this.bot?.botInfo.username;
  }

  /**
   * Stateless outbound send — used by the scheduled digest delivery. Throttled
   * to stay under Telegram's global limit, and resilient to a 429 (waits the
   * advised retry_after, then retries).
   */
  async sendMessage(chatId: string, html: string): Promise<void> {
    const bot = this.bot;
    if (!bot) throw new Error("Telegram bot is not initialized");
    await this.limiter.acquire();
    await withRetryAfter(
      () =>
        bot.api.sendMessage(chatId, html, {
          parse_mode: "HTML",
          // Digest cards carry apply links; a preview card would bloat the message.
          link_preview_options: { is_disabled: true },
        }),
      { maxRetries: SEND_MAX_RETRIES },
    );
  }
}
