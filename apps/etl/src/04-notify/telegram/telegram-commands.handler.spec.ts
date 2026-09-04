import type { ConfigService } from "@nestjs/config";

import type { Bot } from "grammy";

import type { VacancyDto } from "../../03-discovery/feed/feed.contract";
import type { AnalyticsService } from "../../platform/analytics/analytics.service";
import type { TelegramLoginService } from "../../platform/auth/telegram-login.service";
import type { AuthService } from "../../platform/auth/auth.service";

import type { SubscriptionMatcherService } from "./subscription-matcher.service";
import type { SubscriptionsService } from "./subscriptions.service";
import { TelegramCommandsHandler } from "./telegram-commands.handler";
import { copy } from "./telegram-copy";

const WEB_URL = "https://metahunt.test";

function vacancy(overrides: Partial<VacancyDto> = {}): VacancyDto {
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
    match: null,
    ...overrides,
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
  const deactivateForBlock = jest.fn();
  const reactivateAfterUnblock = jest.fn();
  const sample = jest.fn();
  const get = jest.fn();

  const subscriptions = {
    linkChat,
    listActiveByChat,
    getActiveById,
    describe: describe_,
    deactivateByChat,
    deactivateById,
    deactivateForBlock,
    reactivateAfterUnblock,
  } as unknown as SubscriptionsService;
  const matcher = { sample } as unknown as SubscriptionMatcherService;
  const config = { get } as unknown as ConfigService;
  const analytics = {} as unknown as AnalyticsService;
  const describeLogin = jest.fn();
  const confirmLogin = jest.fn();
  const declineLogin = jest.fn();
  const login = {
    describe: describeLogin,
    confirm: confirmLogin,
    decline: declineLogin,
  } as unknown as TelegramLoginService;
  const resolveTelegramUser = jest.fn();
  const auth = { resolveTelegramUser } as unknown as AuthService;

  let commands: Map<string, Handler>;
  let callbacks: { pattern: RegExp; handler: Handler }[];
  let events: Map<string, Handler>;

  beforeEach(() => {
    jest.clearAllMocks();
    describe_.mockResolvedValue("Backend");
    resolveTelegramUser.mockResolvedValue({ userId: "person-1", created: false });
    get.mockReturnValue("https://metahunt.test");
    const handler = new TelegramCommandsHandler(
      config,
      subscriptions,
      matcher,
      analytics,
      login,
      auth,
    );
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

    it("asks a login_ payload to be confirmed instead of logging anyone in", async () => {
      describeLogin.mockResolvedValue({ nonce: "abc123", verificationCode: "K7QM", mode: "login" });
      const ctx = commandCtx("login_abc123");

      await commands.get("start")!(ctx);

      expect(describeLogin).toHaveBeenCalledWith("login_abc123");
      expect(confirmLogin).not.toHaveBeenCalled();
      expect(linkChat).not.toHaveBeenCalled();
      const [text, opts] = ctx.reply.mock.calls[0];
      expect(text).toBe(copy.start.loginConfirm("K7QM", "login"));
      expect(JSON.stringify(opts.reply_markup)).toContain("login:ok:abc123");
      expect(JSON.stringify(opts.reply_markup)).toContain("login:no:abc123");
    });

    it("tells the user a stale login link is stale", async () => {
      describeLogin.mockResolvedValue(null);
      const ctx = commandCtx("login_gone");

      await commands.get("start")!(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(copy.start.loginExpired(WEB_URL));
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
        userId: "person-1",
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
      expect(ctx.reply.mock.calls[1][0]).toContain("Backend");
      expect(ctx.reply.mock.calls[1][0]).toContain("?s=the-token");
      expect(ctx.reply.mock.calls[1][1]).toEqual(expect.objectContaining({ parse_mode: "HTML" }));
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

      expect(describe_).toHaveBeenCalledWith({});
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

  describe("my_chat_member", () => {
    function memberCtx(status: string, chatId = 42) {
      return { myChatMember: { chat: { id: chatId }, new_chat_member: { status } } };
    }

    it("deactivates the chat's subscriptions when the bot is blocked", async () => {
      deactivateForBlock.mockResolvedValue(2);

      await events.get("my_chat_member")!(memberCtx("kicked"));

      expect(deactivateForBlock).toHaveBeenCalledWith("42");
      expect(reactivateAfterUnblock).not.toHaveBeenCalled();
    });

    it("restores block-deactivated subscriptions on unblock", async () => {
      reactivateAfterUnblock.mockResolvedValue(1);

      await events.get("my_chat_member")!(memberCtx("member"));

      expect(reactivateAfterUnblock).toHaveBeenCalledWith("42");
      expect(deactivateForBlock).not.toHaveBeenCalled();
    });

    it("ignores other membership transitions", async () => {
      await events.get("my_chat_member")!(memberCtx("administrator"));

      expect(deactivateForBlock).not.toHaveBeenCalled();
      expect(reactivateAfterUnblock).not.toHaveBeenCalled();
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

  describe("login callback", () => {
    const CHAT = { id: 42, type: "private" };

    function loginCtx(data: string, chat: { id: number; type: string } | undefined = CHAT) {
      const cb = callbacks.find((c) => c.pattern.test(data))!;
      return {
        cb,
        ctx: {
          match: cb.pattern.exec(data)!,
          chat,
          from: { username: "tguser", first_name: "Tessa" },
          answerCallbackQuery: jest.fn(),
          editMessageText: jest.fn(),
        },
      };
    }

    it.each([
      ["authorized", copy.start.loginConfirmed],
      ["already_authorized", copy.start.loginAlreadyDone],
      ["identity_conflict", copy.start.loginIdentityConflict],
      ["invalid", copy.start.loginExpired(WEB_URL)],
    ])("confirms with the chat id and reports %s", async (result, expected) => {
      confirmLogin.mockResolvedValue(result);
      const { cb, ctx } = loginCtx("login:ok:abc123");

      await cb.handler(ctx);

      expect(confirmLogin).toHaveBeenCalledWith("abc123", "42", {
        username: "tguser",
        firstName: "Tessa",
      });
      expect(ctx.editMessageText).toHaveBeenCalledWith(expected);
    });

    // callback_data is client-supplied, so a forged confirm can arrive from a
    // group — where chat.id is the group's, not a person's.
    it("refuses to confirm outside a private chat", async () => {
      const { cb, ctx } = loginCtx("login:ok:abc123", { id: -1001234567890, type: "supergroup" });

      await cb.handler(ctx);

      expect(confirmLogin).not.toHaveBeenCalled();
      expect(ctx.editMessageText).not.toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: copy.start.loginPrivateOnly });
    });

    it("burns the request when the user says it wasn't them", async () => {
      const { cb, ctx } = loginCtx("login:no:abc123");

      await cb.handler(ctx);

      expect(declineLogin).toHaveBeenCalledWith("abc123");
      expect(confirmLogin).not.toHaveBeenCalled();
      expect(ctx.editMessageText).toHaveBeenCalledWith(copy.start.loginDeclined);
    });

    it("does not let a group callback cancel a login request", async () => {
      const { cb, ctx } = loginCtx("login:no:abc123", { id: -1001234567890, type: "supergroup" });

      await cb.handler(ctx);

      expect(declineLogin).not.toHaveBeenCalled();
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: copy.start.loginPrivateOnly });
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

    it("sends one message per vacancy, silencing every message after the first", async () => {
      listActiveByChat.mockResolvedValue([{ id: "sub-1", params: { q: "go" }, candidateId: null }]);
      sample.mockResolvedValue({
        items: [vacancy({ id: "v1" }), vacancy({ id: "v2" }), vacancy({ id: "v3" })],
        total: 3,
        label: "go",
      });
      const ctx = commandCtx("");

      await commands.get("preview")!(ctx);

      expect(ctx.reply).toHaveBeenCalledTimes(3);
      expect(ctx.reply.mock.calls[0][1]).toEqual(
        expect.objectContaining({ disable_notification: false }),
      );
      expect(ctx.reply.mock.calls[1][1]).toEqual(
        expect.objectContaining({ disable_notification: true }),
      );
      expect(ctx.reply.mock.calls[2][1]).toEqual(
        expect.objectContaining({ disable_notification: true }),
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
