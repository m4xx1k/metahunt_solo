import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Bot, InlineKeyboard } from "grammy";

import { AnalyticsService } from "../../platform/analytics/analytics.service";
import {
  isLoginStartPayload,
  TelegramLoginService,
} from "../../platform/auth/telegram-login.service";

import { renderDigest } from "./digest.renderer";
import { SubscriptionMatcherService } from "./subscription-matcher.service";
import { SubscriptionsService } from "./subscriptions.service";
import { copy } from "./telegram-copy";

const NO_LINK_PREVIEW = { link_preview_options: { is_disabled: true } } as const;

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
    private readonly analytics: AnalyticsService,
    private readonly login: TelegramLoginService,
  ) {}

  /** Wire every command/callback handler onto the bot. Call before `bot.start()`. */
  register(bot: Bot): void {
    bot.command("start", async (ctx) => {
      const token = ctx.match.trim();
      const chatId = String(ctx.chat.id);

      if (token.length === 0) {
        const webUrl = this.config.get<string>("WEB_BASE_URL")!;
        await ctx.reply(copy.start.greeting(webUrl), {
          parse_mode: "HTML",
          ...NO_LINK_PREVIEW,
        });
        return;
      }

      // Two token kinds share `/start`: `login_<nonce>` completes a web login,
      // anything else is a subscription deep link.
      if (isLoginStartPayload(token)) {
        await this.handleLoginStart(token, ctx.reply.bind(ctx));
        return;
      }

      const result = await this.subscriptions.linkChat(token, chatId, {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
      });
      if (result === "linked") {
        await ctx.reply(copy.start.linked);
        await this.sendActivationPreview(token, ctx.reply.bind(ctx));
      } else if (result === "already_active") {
        await ctx.reply(copy.start.alreadyActive);
      } else if (result === "duplicate") {
        await ctx.reply(copy.start.duplicate);
      } else {
        const webUrl = this.config.get<string>("WEB_BASE_URL")!;
        await ctx.reply(copy.start.invalidToken(webUrl), NO_LINK_PREVIEW);
      }
    });

    bot.command("preview", async (ctx) => {
      const subs = await this.subscriptions.listActiveByChat(String(ctx.chat.id));
      if (subs.length === 0) {
        const webUrl = this.config.get<string>("WEB_BASE_URL")!;
        await ctx.reply(copy.preview.empty(webUrl), NO_LINK_PREVIEW);
        return;
      }

      const applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
      for (const sub of subs) {
        const { items, total, label } = await this.matcher.sample(sub, DIGEST_WINDOW_DAYS);
        await ctx.reply(
          renderDigest(items.slice(0, DIGEST_PREVIEW_SIZE), {
            totalNew: total,
            windowDays: DIGEST_WINDOW_DAYS,
            applyBaseUrl,
            label,
          }),
          { parse_mode: "HTML", ...NO_LINK_PREVIEW },
        );
      }
    });

    bot.command("list", async (ctx) => {
      const subs = await this.subscriptions.listActiveByChat(String(ctx.chat.id));
      if (subs.length === 0) {
        const webUrl = this.config.get<string>("WEB_BASE_URL")!;
        await ctx.reply(copy.list.empty(webUrl), NO_LINK_PREVIEW);
        return;
      }

      for (const sub of subs) {
        const label = await this.subscriptions.describe(sub.params, sub.candidateId);
        await ctx.reply(copy.list.item(label), {
          reply_markup: new InlineKeyboard().text(copy.list.unsubButton, `unsub:${sub.id}`),
        });
      }
    });

    bot.callbackQuery(/^unsub:(.+)$/, async (ctx) => {
      const id = ctx.match[1];
      const chatId = ctx.chat?.id;
      const stopped =
        chatId !== undefined && (await this.subscriptions.deactivateById(id, String(chatId)));
      await ctx.answerCallbackQuery(stopped ? copy.unsub.done : copy.unsub.notFound);
      if (stopped) await ctx.editMessageText(copy.unsub.confirmed);
    });

    bot.callbackQuery(/^login:(ok|no):(.+)$/, async (ctx) => {
      const [, action, nonce] = ctx.match;
      // Both confirmation and cancellation are bound to a private chat. A
      // group callback is client-controlled and must not be able to mint — or
      // burn — another browser's one-time login request.
      const chatId = ctx.chat?.id;
      if (ctx.chat?.type !== "private" || chatId === undefined) {
        await ctx.answerCallbackQuery({ text: copy.start.loginPrivateOnly });
        return;
      }

      if (action === "no") {
        await this.login.decline(nonce);
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(copy.start.loginDeclined);
        return;
      }

      const result = await this.login.confirm(nonce, String(chatId), {
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
      });
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        result === "authorized"
          ? copy.start.loginConfirmed
          : result === "already_authorized"
            ? copy.start.loginAlreadyDone
            : result === "identity_conflict"
              ? copy.start.loginIdentityConflict
              : copy.start.loginExpired(this.config.get<string>("WEB_BASE_URL")!),
      );
    });

    bot.command("stop", async (ctx) => {
      const stopped = await this.subscriptions.deactivateByChat(String(ctx.chat.id));
      await ctx.reply(stopped > 0 ? copy.stop.done : copy.stop.empty);
    });

    bot.command("help", async (ctx) => {
      await ctx.reply(copy.help());
    });

    // Telegram reports block/unblock via my_chat_member (in the default
    // allowed_updates). Block deactivates with reason `blocked`; unblock
    // restores only block/unreachable deactivations — never explicit ones.
    bot.on("my_chat_member", async (ctx) => {
      const status = ctx.myChatMember.new_chat_member.status;
      const chatId = String(ctx.myChatMember.chat.id);
      if (status === "kicked") {
        const blocked = await this.subscriptions.deactivateForBlock(chatId);
        if (blocked > 0) this.logger.log(`chat blocked the bot → ${blocked} sub(s) deactivated`);
      } else if (status === "member") {
        const restored = await this.subscriptions.reactivateAfterUnblock(chatId);
        if (restored > 0) this.logger.log(`chat unblocked the bot → ${restored} sub(s) restored`);
      }
    });

    // Catch-all: any text that isn't a handled command. Registered last so the
    // commands above take precedence; keeps the bot from silently ignoring input.
    bot.on("message", async (ctx) => {
      const webUrl = this.config.get<string>("WEB_BASE_URL")!;
      await ctx.reply(copy.fallback(webUrl), NO_LINK_PREVIEW);
    });

    bot.catch(async (err) => {
      this.logger.error("Telegram update handler failed", err.error);
      // Surface the failure to the user instead of leaving them hanging; the
      // reply itself may fail (e.g. the original error was a send), so swallow it.
      await err.ctx.reply(copy.error).catch(() => undefined);
    });
  }

  // Pressing START must not be what logs anyone in — a forwarded link would
  // then hand the tapper's account to whoever minted it. All this does is ask.
  private async handleLoginStart(
    token: string,
    reply: (text: string, options?: Record<string, unknown>) => Promise<unknown>,
  ): Promise<void> {
    const request = await this.login.describe(token);
    if (!request) {
      const webUrl = this.config.get<string>("WEB_BASE_URL")!;
      await reply(copy.start.loginExpired(webUrl), NO_LINK_PREVIEW);
      return;
    }

    await reply(copy.start.loginConfirm(request.verificationCode, request.mode), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard()
        .text(copy.start.loginConfirmButton, `login:ok:${request.nonce}`)
        .row()
        .text(copy.start.loginDeclineButton, `login:no:${request.nonce}`),
      ...NO_LINK_PREVIEW,
    });
  }

  private async sendActivationPreview(
    subscriptionId: string,
    reply: (text: string, options: Record<string, unknown>) => Promise<unknown>,
  ): Promise<void> {
    try {
      const sub = await this.subscriptions.getActiveById(subscriptionId);
      if (!sub) return;

      const { items, total, label } = await this.matcher.sample(sub, DIGEST_WINDOW_DAYS);
      const shown = items.slice(0, DIGEST_PREVIEW_SIZE);
      const applyBaseUrl = this.config.get<string>("PUBLIC_BASE_URL")!;
      await reply(
        renderDigest(shown, {
          totalNew: total,
          windowDays: DIGEST_WINDOW_DAYS,
          applyBaseUrl,
          label,
          subscriptionId,
        }),
        { parse_mode: "HTML", ...NO_LINK_PREVIEW },
      );
      void this.analytics.activationValueShown(subscriptionId, total, shown.length);
    } catch (error) {
      this.logger.warn(
        `Activation preview failed for subscription ${subscriptionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
