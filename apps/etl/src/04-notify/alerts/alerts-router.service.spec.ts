import { ConfigService } from "@nestjs/config";

import { AlertsRouterService } from "./alerts-router.service";

const ACTIVE = [
  { id: "sub-owner", chatId: "chat-owner" },
  { id: "sub-owner-2", chatId: "chat-owner" },
  { id: "sub-tester", chatId: "chat-tester" },
];

function router(env: Record<string, string>, overrides: { deliverChat?: jest.Mock } = {}) {
  const subscriptions = {
    listActiveIds: jest.fn().mockResolvedValue(ACTIVE.map((s) => s.id)),
    listActiveRefs: jest.fn().mockResolvedValue(ACTIVE),
    listActiveChatIds: jest.fn().mockResolvedValue(["chat-owner", "chat-tester"]),
  };
  const digest = { deliver: jest.fn().mockResolvedValue(1) };
  const alerts = { deliverChat: overrides.deliverChat ?? jest.fn().mockResolvedValue({ sent: 2 }) };
  const service = new AlertsRouterService(
    new ConfigService(env),
    subscriptions as never,
    digest as never,
    alerts as never,
  );
  return { service, subscriptions, digest, alerts };
}

describe("AlertsRouterService.plan", () => {
  it("v1 with no canary → every subscription through v1, exactly as before", async () => {
    const { service, subscriptions } = router({});
    await expect(service.plan()).resolves.toEqual({
      subscriptionIds: ["sub-owner", "sub-owner-2", "sub-tester"],
      chatIds: [],
    });
    expect(subscriptions.listActiveIds).toHaveBeenCalled();
  });

  it("v1 with a canary → the canary chat moves to v2, its subscriptions leave v1", async () => {
    const { service } = router({ ALERTS_V2_CHAT_IDS: "chat-owner, chat-unknown" });
    await expect(service.plan()).resolves.toEqual({
      subscriptionIds: ["sub-tester"],
      chatIds: ["chat-owner"],
    });
  });

  it("v2 → every chat through v2, nothing through v1", async () => {
    const { service } = router({ ALERTS_ENGINE: "v2", ALERTS_V2_CHAT_IDS: "chat-owner" });
    await expect(service.plan()).resolves.toEqual({
      subscriptionIds: [],
      chatIds: ["chat-owner", "chat-tester"],
    });
  });
});

describe("AlertsRouterService.runAll", () => {
  it("runs both halves of the split and isolates a failing chat", async () => {
    const deliverChat = jest
      .fn()
      .mockRejectedValueOnce(new Error("telegram down"))
      .mockResolvedValue({ sent: 3 });
    const { service, digest } = router(
      { ALERTS_V2_CHAT_IDS: "chat-owner,chat-tester" },
      { deliverChat },
    );
    await expect(service.runAll()).resolves.toEqual({
      subscriptions: 0,
      chats: 2,
      sent: 3,
      failed: 1,
    });
    expect(digest.deliver).not.toHaveBeenCalled();
  });
});
