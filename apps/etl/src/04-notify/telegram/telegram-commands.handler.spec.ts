import type { ConfigService } from "@nestjs/config";

import type { Bot } from "grammy";

import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import type { AnalyticsService } from "../../platform/analytics/analytics.service";

import type { SubscriptionMatcherService } from "./subscription-matcher.service";
import type { SubscriptionsService } from "./subscriptions.service";
import { TelegramCommandsHandler } from "./telegram-commands.handler";
import { copy } from "./telegram-copy";

const WEB_URL = "https://metahunt.test";

function vacancy(): VacancyDto {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-1111-1111-111111111111",
    externalId: "ext-1",
    rssRecordId: "rss-1",
    source: { id: "source-1", code: "dou", displayName: "DOU" },
    link: "https://jobs.dou.ua/companies/example/vacancies/1",
    publishedAt: now,
    loadedAt: now,
    updatedAt: now,
    title: "Backend Engineer",
    description: null,
    company: null,
    role: { id: "role-1", name: "Backend Developer" },
    domain: null,
    skills: { required: [], optional: [] },
    seniority: "MIDDLE",
    workFormat: "REMOTE",
    employmentType: null,
    englishLevel: null,
    experienceYears: null,
    engagementType: null,
    hasTestAssignment: null,
    hasReservation: null,
    salary: { min: null, max: null, currency: null },
    locations: [],
    uniqueVacancyId: null,
    duplicateCount: null,
    duplicateSourceCount: null,
  };
}

// A minimal stand-in for grammy's Bot that records the handlers `register()`
// wires up, so each can be invoked with a fake context. This is exactly the
// seam the decomposition opened: the handler takes the bot, it doesn't own it.
type Handler = (ctx: unknown) => Promise<void>;

function fakeBot() {
  const commands = new Map<string, Handler>();
  const callbacks: { pattern: RegExp; handler: Handler }[] = [];
  const events = new Map<string, Handler>();
  const bot = {
    command: (name: string, h: Handler) => commands.set(name, h),
    callbackQuery: (pattern: RegExp, h: Handler) => callbacks.push({ pattern, handler: h }),
    on: (event: string, h: Handler) => events.set(event, h),
    catch: () => undefined,
  };
  return { bot: bot as unknown as Bot, commands, callbacks, events };
}

function commandCtx(match: string, chatId = 42) {
  return {
    match,
    chat: { id: chatId },
    from: { username: "tguser", first_name: "Tessa" },
    reply: jest.fn(),
  };
}

describe("TelegramCommandsHandler", () => {
  const linkChat = jest.fn();
  const listActiveByChat = jest.fn();
  const getActiveById = jest.fn();
  const describe_ = jest.fn();
  const deactivateByChat = jest.fn();
  const deactivateById = jest.fn();
  const sample = jest.fn();
  const get = jest.fn();
  const activationValueShown = jest.fn();

  const subscriptions = {
    linkChat,
    listActiveByChat,
    getActiveById,
    describe: describe_,
    deactivateByChat,
    deactivateById,
  } as unknown as SubscriptionsService;
  const matcher = { sample } as unknown as SubscriptionMatcherService;
  const config = { get } as unknown as ConfigService;
  const analytics = { activationValueShown } as unknown as AnalyticsService;

  let commands: Map<string, Handler>;
  let callbacks: { pattern: RegExp; handler: Handler }[];
  let events: Map<string, Handler>;

  beforeEach(() => {
    jest.clearAllMocks();
    describe_.mockResolvedValue("Backend");
    get.mockReturnValue("https://metahunt.test");
    const handler = new TelegramCommandsHandler(config, subscriptions, matcher, analytics);
    const wired = fakeBot();
    handler.register(wired.bot);
    commands = wired.commands;
    callbacks = wired.callbacks;
    events = wired.events;
  });

  describe("/start", () => {
    it("greets with a direct site link and explains subscriptions when there's no token", async () => {
      const ctx = commandCtx("   ");
      await commands.get("start")!(ctx);

      expect(linkChat).not.toHaveBeenCalled();
      const [text, opts] = ctx.reply.mock.calls[0];
      expect(text).toBe(copy.start.greeting(WEB_URL));
      expect(opts).toEqual(expect.objectContaining({ parse_mode: "HTML" }));
    });

    it.each([
      ["linked", copy.start.linked],
      ["already_active", copy.start.alreadyActive],
      ["duplicate", copy.start.duplicate],
      ["not_found", copy.start.invalidToken(WEB_URL)],
    ])("routes link result %s to the right reply", async (result, expected) => {
      linkChat.mockResolvedValue(result);
      const ctx = commandCtx("the-token");

      await commands.get("start")!(ctx);

      expect(linkChat).toHaveBeenCalledWith("the-token", "42", {
        username: "tguser",
        firstName: "Tessa",
      });
      expect(ctx.reply.mock.calls[0][0]).toBe(expected);
    });

    it("shows an attributed sample immediately after a fresh activation", async () => {
      const sub = {
        id: "the-token",
        chatId: "42",
        params: { roleIds: ["backend"] },
        candidateId: null,
        createdAt: new Date(),
      };
      linkChat.mockResolvedValue("linked");
      getActiveById.mockResolvedValue(sub);
      sample.mockResolvedValue({ items: [vacancy()], total: 1, label: "Backend" });
      const ctx = commandCtx("the-token");

      await commands.get("start")!(ctx);

      expect(getActiveById).toHaveBeenCalledWith("the-token");
      expect(sample).toHaveBeenCalledWith(sub, 14);
      expect(ctx.reply).toHaveBeenCalledTimes(2);
      expect(ctx.reply.mock.calls[1][0]).toContain("<b>1</b>");
      expect(ctx.reply.mock.calls[1][0]).toContain("?s=the-token");
      expect(ctx.reply.mock.calls[1][1]).toEqual(expect.objectContaining({ parse_mode: "HTML" }));
      expect(activationValueShown).toHaveBeenCalledWith("the-token", 1, 1);
    });

    it("keeps a successful activation confirmed when preview matching fails", async () => {
      linkChat.mockResolvedValue("linked");
      getActiveById.mockResolvedValue({
        id: "the-token",
        chatId: "42",
        params: {},
        candidateId: null,
        createdAt: new Date(),
      });
      sample.mockRejectedValue(new Error("catalog unavailable"));
      const ctx = commandCtx("the-token");

      await expect(commands.get("start")!(ctx)).resolves.toBeUndefined();

      expect(ctx.reply).toHaveBeenCalledTimes(1);
      expect(ctx.reply).toHaveBeenCalledWith(copy.start.linked);
      expect(activationValueShown).not.toHaveBeenCalled();
    });
  });

  describe("/list", () => {
    it("reports an empty list", async () => {
      listActiveByChat.mockResolvedValue([]);
      const ctx = commandCtx("");

      await commands.get("list")!(ctx);

      // The fix: an empty list must still route the user to the site.
      const [text] = ctx.reply.mock.calls[0];
      expect(text).toBe(copy.list.empty(WEB_URL));
    });

    it("renders one labelled row with an unsubscribe button per sub", async () => {
      listActiveByChat.mockResolvedValue([{ id: "sub-1", params: {}, candidateId: null }]);
      const ctx = commandCtx("");

      await commands.get("list")!(ctx);

      expect(describe_).toHaveBeenCalledWith({}, null);
      expect(ctx.reply).toHaveBeenCalledWith(
        copy.list.item("Backend"),
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
      expect(ctx.reply).toHaveBeenCalledWith(copy.stop.done);
    });

    it("reports nothing to stop", async () => {
      deactivateByChat.mockResolvedValue(0);
      const ctx = commandCtx("");

      await commands.get("stop")!(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(copy.stop.empty);
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
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(copy.unsub.done);
      expect(ctx.editMessageText).toHaveBeenCalledWith(copy.unsub.confirmed);
    });

    it("does not edit when the sub wasn't found", async () => {
      deactivateById.mockResolvedValue(false);
      const { cb, ctx } = unsubCtx("sub-1");

      await cb.handler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith(copy.unsub.notFound);
      expect(ctx.editMessageText).not.toHaveBeenCalled();
    });
  });

  describe("/preview", () => {
    it("nudges the user to the site when there are no subs", async () => {
      listActiveByChat.mockResolvedValue([]);
      const ctx = commandCtx("");

      await commands.get("preview")!(ctx);

      expect(sample).not.toHaveBeenCalled();
      const [text] = ctx.reply.mock.calls[0];
      expect(text).toBe(copy.preview.empty(WEB_URL));
    });

    it("sends a rendered HTML sample per subscription", async () => {
      listActiveByChat.mockResolvedValue([{ id: "sub-1", params: { q: "go" }, candidateId: null }]);
      sample.mockResolvedValue({ items: [], total: 0, label: "go" });
      const ctx = commandCtx("");

      await commands.get("preview")!(ctx);

      expect(sample).toHaveBeenCalledWith(expect.objectContaining({ id: "sub-1" }), 14);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ parse_mode: "HTML" }),
      );
    });
  });

  describe("free-text fallback", () => {
    it("nudges back to /help instead of staying silent", async () => {
      const ctx = { chat: { id: 42 }, reply: jest.fn() };

      await events.get("message")!(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(copy.fallback(WEB_URL), expect.anything());
    });
  });
});
