import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Bot, GrammyError } from "grammy";

import { RateLimiter, withRetryAfter } from "./rate-limiter";
import { TelegramCommandsHandler } from "./telegram-commands.handler";
import { BOT_COMMANDS } from "./telegram-copy";

// Telegram caps outbound at ~30 msg/s globally; stay comfortably under it.
const SEND_INTERVAL_MS = 50; // ≈20 msg/s
// A burst to one chat can still trip a per-chat 429 — honor its retry_after
// rather than burning the activity's Temporal attempts on a transient limit.
const SEND_MAX_RETRIES = 2;
// A dropped connection or DNS hiccup never reached Telegram at all — worth a
// couple of quick local retries before falling through to Temporal's slower
// activity-level backoff.
const SEND_NETWORK_MAX_RETRIES = 2;
const SEND_NETWORK_RETRY_DELAY_MS = 750;

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
  private stopping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly commands: TelegramCommandsHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (token.length === 0) {
      this.logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot is dormant (no poller).");
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
    this.startPolling(bot);
  }

  // A hot-reload or redeploy briefly overlaps the previous poller, so Telegram
  // 409s one of them ("terminated by other getUpdates request"). Swallow that
  // rejection (an unhandled one would crash the process) and re-acquire the poll
  // — unless we're shutting down, where onModuleDestroy stops the bot on purpose.
  private startPolling(bot: Bot): void {
    void bot
      .start({
        onStart: (me) => this.logger.log(`Telegram bot @${me.username} polling`),
      })
      .catch((err: unknown) => {
        if (this.stopping) return;
        // 409 = a newer poller (a hot-reload or redeploy) has taken over this
        // bot. We've been superseded, so stop quietly — retrying would only
        // fight the newer instance for the poll (and an unhandled rejection
        // would crash the process). Other errors are transient: retry.
        if (err instanceof GrammyError && err.error_code === 409) {
          this.logger.warn(
            "Telegram poll taken over by a newer instance (409) — this poller is stopping.",
          );
          return;
        }
        this.logger.warn(`Telegram polling error; retrying in 3s: ${String(err)}`);
        setTimeout(() => {
          if (!this.stopping && !bot.isRunning()) this.startPolling(bot);
        }, 3000);
      });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
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
      {
        maxRetries: SEND_MAX_RETRIES,
        networkRetries: SEND_NETWORK_MAX_RETRIES,
        networkRetryDelayMs: SEND_NETWORK_RETRY_DELAY_MS,
      },
    );
  }
}
