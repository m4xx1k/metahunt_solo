import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot } from "grammy";

import { FeedService, type FeedSearchParams } from "../feed/feed.service";
import { renderDigest } from "./digest.renderer";
import { SubscriptionsService } from "./subscriptions.service";

const DIGEST_WINDOW_DAYS = 14;
const DIGEST_PREVIEW_SIZE = 3;
const DAY_MS = 86_400_000;

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
    private readonly feed: FeedService,
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
    this.registerHandlers(bot);

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

  /** Bot @username (from getMe), once initialized. Undefined while dormant. */
  get botUsername(): string | undefined {
    return this.bot?.botInfo.username;
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

    bot.command("preview", async (ctx) => {
      const subs = await this.subscriptions.listActiveByChat(
        String(ctx.chat.id),
      );
      if (subs.length === 0) {
        await ctx.reply("У тебе немає активних підписок. Створи на сайті.");
        return;
      }

      const loadedAfter = new Date(Date.now() - DIGEST_WINDOW_DAYS * DAY_MS);
      for (const sub of subs) {
        // Stored params are a feed query (whitelisted keys) — a JSON boundary.
        const params = sub.params as Partial<FeedSearchParams>;
        const { items, total } = await this.feed.search({
          ...params,
          page: 1,
          pageSize: DIGEST_PREVIEW_SIZE,
          loadedAfter,
        });
        await ctx.reply(
          renderDigest(items, {
            totalNew: total,
            windowDays: DIGEST_WINDOW_DAYS,
          }),
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        );
      }
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
          "/preview — показати приклад дайджесту за твоїм фільтром\n" +
          "/stop — вимкнути сповіщення",
      );
    });

    bot.catch((err) => {
      this.logger.error("Telegram update handler failed", err.error);
    });
  }
}
