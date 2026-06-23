import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Bot, InlineKeyboard } from "grammy";

import { renderDigest } from "./digest.renderer";
import { SubscriptionMatcherService } from "./subscription-matcher.service";
import { SubscriptionsService } from "./subscriptions.service";

const DIGEST_WINDOW_DAYS = 14;
const DIGEST_PREVIEW_SIZE = 3;

// Inbound side of the bot: command + callback handlers. Owns the conversation
// (reply copy, inline keyboards) and reads through the catalog/subscription
// services. Pure router — it holds no bot lifecycle; `TelegramService` creates
// the `Bot` and calls `register(bot)` before starting the poller.
@Injectable()
export class TelegramCommandsHandler {
  private readonly logger = new Logger(TelegramCommandsHandler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: SubscriptionsService,
    private readonly matcher: SubscriptionMatcherService,
  ) {}

  /** Wire every command/callback handler onto the bot. Call before `bot.start()`. */
  register(bot: Bot): void {
    bot.command("start", async (ctx) => {
      const token = ctx.match.trim();
      const chatId = String(ctx.chat.id);

      if (token.length === 0) {
        const webUrl = this.config.get<string>("WEB_BASE_URL")!;
        await ctx.reply(
          `👋 Привіт! Це <b>metahunt</b> — агрегатор IT-вакансій.\n` +
            `🔗 <a href="${webUrl}">${webUrl.replace(/^https?:\/\//, "")}</a>\n\n` +
            `Підписки створюються на сайті: обираєш фільтр і тиснеш ` +
            `«Підписатись» — далі я надсилатиму нові вакансії сюди.`,
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        );
        return;
      }

      const result = await this.subscriptions.linkChat(token, chatId);
      const reply =
        result === "linked"
          ? "✅ Підписку активовано. Надсилатиму нові вакансії за твоїм фільтром."
          : result === "already_active"
            ? "ℹ️ Ця підписка вже активна — нічого робити не треба."
            : result === "duplicate"
              ? "ℹ️ Ти вже підписаний на цей фільтр — нову підписку не створював."
              : "⚠️ Це посилання недійсне або застаріле. Створи підписку на сайті ще раз.";
      await ctx.reply(reply);
    });

    bot.command("preview", async (ctx) => {
      const subs = await this.subscriptions.listActiveByChat(
        String(ctx.chat.id),
      );
      if (subs.length === 0) {
        await ctx.reply("У тебе немає активних підписок. Створи на сайті.");
        return;
      }

      const applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
      for (const sub of subs) {
        const { items, total, label } = await this.matcher.sample(
          sub,
          DIGEST_WINDOW_DAYS,
        );
        await ctx.reply(
          renderDigest(items.slice(0, DIGEST_PREVIEW_SIZE), {
            totalNew: total,
            windowDays: DIGEST_WINDOW_DAYS,
            applyBaseUrl,
            label,
          }),
          {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        );
      }
    });

    bot.command("list", async (ctx) => {
      const subs = await this.subscriptions.listActiveByChat(
        String(ctx.chat.id),
      );
      if (subs.length === 0) {
        await ctx.reply("У тебе немає активних підписок.");
        return;
      }

      for (const sub of subs) {
        const label = await this.subscriptions.describe(
          sub.params,
          sub.candidateId,
        );
        await ctx.reply(`🔔 ${label}`, {
          reply_markup: new InlineKeyboard().text(
            "❌ Відписатись",
            `unsub:${sub.id}`,
          ),
        });
      }
    });

    bot.callbackQuery(/^unsub:(.+)$/, async (ctx) => {
      const id = ctx.match[1];
      const chatId = ctx.chat?.id;
      const stopped =
        chatId !== undefined &&
        (await this.subscriptions.deactivateById(id, String(chatId)));
      await ctx.answerCallbackQuery(
        stopped ? "Відписано" : "Підписку не знайдено",
      );
      if (stopped) await ctx.editMessageText("❌ Відписано.");
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
          "/list — мої підписки (з кнопкою відписки на кожну)\n" +
          "/preview — показати приклад дайджесту за твоїм фільтром\n" +
          "/stop — вимкнути всі сповіщення",
      );
    });

    bot.catch((err) => {
      this.logger.error("Telegram update handler failed", err.error);
    });
  }
}
