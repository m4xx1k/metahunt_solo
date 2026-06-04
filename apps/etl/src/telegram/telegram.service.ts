import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";

import { TelegramCommandsHandler } from "./telegram-commands.handler";

// grammy long-polling is single-consumer: this service must run in exactly ONE
// `@metahunt/etl` replica. Keep the etl service pinned to 1 replica on Railway,
// or extract the poller before scaling the worker horizontally.
//
// Transport only: owns the bot's lifecycle (poller) and the stateless outbound
// `sendMessage`. Inbound commands live in `TelegramCommandsHandler`.
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
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

  /** Stateless outbound send — used by the scheduled digest delivery. */
  async sendMessage(chatId: string, html: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram bot is not initialized");
    await this.bot.api.sendMessage(chatId, html, {
      parse_mode: "HTML",
      // Digest cards carry apply links; a preview card would bloat the message.
      link_preview_options: { is_disabled: true },
    });
  }
}
