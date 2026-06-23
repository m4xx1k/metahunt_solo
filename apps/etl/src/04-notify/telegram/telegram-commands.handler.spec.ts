import type { ConfigService } from "@nestjs/config";
import type { Bot } from "grammy";

import type { SubscriptionMatcherService } from "./subscription-matcher.service";
import type { SubscriptionsService } from "./subscriptions.service";
import { TelegramCommandsHandler } from "./telegram-commands.handler";

// A minimal stand-in for grammy's Bot that records the handlers `register()`
// wires up, so each can be invoked with a fake context. This is exactly the
// seam the decomposition opened: the handler takes the bot, it doesn't own it.
type Handler = (ctx: unknown) => Promise<void>;

function fakeBot() {
  const commands = new Map<string, Handler>();
  const callbacks: { pattern: RegExp; handler: Handler }[] = [];
  const bot = {
    command: (name: string, h: Handler) => commands.set(name, h),
    callbackQuery: (pattern: RegExp, h: Handler) =>
      callbacks.push({ pattern, handler: h }),
    catch: () => undefined,
  };
  return { bot: bot as unknown as Bot, commands, callbacks };
}

function commandCtx(match: string, chatId = 42) {
  return { match, chat: { id: chatId }, reply: jest.fn() };
}

describe("TelegramCommandsHandler", () => {
  const linkChat = jest.fn();
  const listActiveByChat = jest.fn();
  const describe_ = jest.fn();
  const deactivateByChat = jest.fn();
  const deactivateById = jest.fn();
  const sample = jest.fn();
  const get = jest.fn();

  const subscriptions = {
    linkChat,
    listActiveByChat,
    describe: describe_,
    deactivateByChat,
    deactivateById,
  } as unknown as SubscriptionsService;
  const matcher = { sample } as unknown as SubscriptionMatcherService;
  const config = { get } as unknown as ConfigService;

  let commands: Map<string, Handler>;
  let callbacks: { pattern: RegExp; handler: Handler }[];

  beforeEach(() => {
    jest.clearAllMocks();
    describe_.mockResolvedValue("Backend");
    get.mockReturnValue("https://metahunt.test");
    const handler = new TelegramCommandsHandler(config, subscriptions, matcher);
    const wired = fakeBot();
    handler.register(wired.bot);
    commands = wired.commands;
    callbacks = wired.callbacks;
  });

  describe("/start", () => {
    it("greets with a direct site link and explains subscriptions when there's no token", async () => {
      const ctx = commandCtx("   ");
      await commands.get("start")!(ctx);

      expect(linkChat).not.toHaveBeenCalled();
      const [text, opts] = (ctx.reply as jest.Mock).mock.calls[0];
      expect(text).toContain("створюються на сайті");
      expect(text).toContain('<a href="https://metahunt.test">');
      expect(opts).toEqual(
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });

    it.each([
      ["linked", "активовано"],
      ["already_active", "вже активна"],
      ["duplicate", "вже підписаний"],
      ["not_found", "недійсне або застаріле"],
    ])("maps result %s to its reply", async (result, fragment) => {
      linkChat.mockResolvedValue(result);
      const ctx = commandCtx("the-token");

      await commands.get("start")!(ctx);

      expect(linkChat).toHaveBeenCalledWith("the-token", "42");
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(fragment));
    });
  });

  describe("/list", () => {
    it("reports an empty list", async () => {
      listActiveByChat.mockResolvedValue([]);
      const ctx = commandCtx("");

      await commands.get("list")!(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("У тебе немає активних підписок.");
    });

    it("renders one labelled row with an unsubscribe button per sub", async () => {
      listActiveByChat.mockResolvedValue([
        { id: "sub-1", params: {}, candidateId: null },
      ]);
      const ctx = commandCtx("");

      await commands.get("list")!(ctx);

      expect(describe_).toHaveBeenCalledWith({}, null);
      expect(ctx.reply).toHaveBeenCalledWith(
        "🔔 Backend",
        expect.objectContaining({ reply_markup: expect.anything() }),
      );
    });
  });

  describe("/stop", () => {
    it("confirms when subscriptions were deactivated", async () => {
      deactivateByChat.mockResolvedValue(2);
      const ctx = commandCtx("");

      await commands.get("stop")!(ctx);

      expect(deactivateByChat).toHaveBeenCalledWith("42");
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("вимкнено"),
      );
    });

    it("reports nothing to stop", async () => {
      deactivateByChat.mockResolvedValue(0);
      const ctx = commandCtx("");

      await commands.get("stop")!(ctx);

      expect(ctx.reply).toHaveBeenCalledWith("У тебе немає активних підписок.");
    });
  });

  describe("unsub callback", () => {
    function unsubCtx(id: string, chatId: number | undefined = 42) {
      const cb = callbacks[0];
      const match = cb.pattern.exec(`unsub:${id}`)!;
      return {
        cb,
        ctx: {
          match,
          chat: chatId === undefined ? undefined : { id: chatId },
          answerCallbackQuery: jest.fn(),
          editMessageText: jest.fn(),
        },
      };
    }

    it("deactivates the sub scoped to the chat and edits the message", async () => {
      deactivateById.mockResolvedValue(true);
      const { cb, ctx } = unsubCtx("sub-1");

      await cb.handler(ctx);

      expect(deactivateById).toHaveBeenCalledWith("sub-1", "42");
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith("Відписано");
      expect(ctx.editMessageText).toHaveBeenCalledWith("❌ Відписано.");
    });

    it("does not edit when the sub wasn't found", async () => {
      deactivateById.mockResolvedValue(false);
      const { cb, ctx } = unsubCtx("sub-1");

      await cb.handler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(
        "Підписку не знайдено",
      );
      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe("/preview", () => {
    it("nudges the user to the site when there are no subs", async () => {
      listActiveByChat.mockResolvedValue([]);
      const ctx = commandCtx("");

      await commands.get("preview")!(ctx);

      expect(sample).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining("Створи на сайті"),
      );
    });

    it("sends a rendered HTML sample per subscription", async () => {
      listActiveByChat.mockResolvedValue([
        { id: "sub-1", params: { q: "go" }, candidateId: null },
      ]);
      sample.mockResolvedValue({ items: [], total: 0, label: "go" });
      const ctx = commandCtx("");

      await commands.get("preview")!(ctx);

      expect(sample).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sub-1" }),
        14,
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });
  });
});
