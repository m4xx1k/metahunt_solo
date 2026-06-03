import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";

import { SubscriptionsService } from "./subscriptions.service";

// grammy long-polling is single-consumer: this service must run in exactly ONE
// `@metahunt/etl` replica. Keep the etl service pinned to 1 replica on Railway,
// or extract the poller before scaling the worker horizontally.
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Bot;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  onModuleInit(): void {
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN") ?? "";
    if (token.length === 0) {
      this.logger.warn(
        "TELEGRAM_BOT_TOKEN not set — Telegram bot is dormant (no poller).",
      );
      return;
    }

    const bot = new Bot(token);
    this.registerHandlers(bot);
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

  /** Stateless outbound send — used by the digest activity later. */
  async sendMessage(chatId: string, html: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram bot is not initialized");
    await this.bot.api.sendMessage(chatId, html, { parse_mode: "HTML" });
  }

  private registerHandlers(bot: Bot): void {
    bot.command("start", async (ctx) => {
      const token = ctx.match.trim();
      const chatId = String(ctx.chat.id);

      if (token.length === 0) {
        await ctx.reply(
          "👋 Привіт! Підписки на вакансії створюються на сайті — там ти " +
            "обираєш фільтр і отримуєш кнопку «Підписатись».",
        );
        return;
      }

      const result = await this.subscriptions.linkChat(token, chatId);
      await ctx.reply(
        result === "linked"
          ? "✅ Підписку активовано. Надсилатиму нові вакансії за твоїм фільтром."
          : "⚠️ Це посилання недійсне або застаріле. Створи підписку на сайті ще раз.",
      );
    });

    bot.command("stop", async (ctx) => {
      const stopped = await this.subscriptions.deactivateByChat(
        String(ctx.chat.id),
      );
      await ctx.reply(
        stopped > 0
          ? "🛑 Сповіщення вимкнено."
          : "У тебе немає активних підписок.",
      );
    });

    bot.command("help", async (ctx) => {
      await ctx.reply(
        "Команди:\n/start — активувати підписку за посиланням із сайту\n" +
          "/stop — вимкнути сповіщення",
      );
    });

    bot.catch((err) => {
      this.logger.error("Telegram update handler failed", err.error);
    });
  }
}
