import { ConfigService } from "@nestjs/config";

import { TelegramService } from "./telegram.service";

function service(env: Record<string, string>): TelegramService {
  return new TelegramService(new ConfigService(env), {} as never);
}

describe("TelegramService non-prod guard", () => {
  it("talks to every chat in production", () => {
    expect(service({ NODE_ENV: "production" }).canSendTo("any-chat")).toBe(true);
  });

  it("outside production, talks only to allowlisted chats", () => {
    const telegram = service({
      NODE_ENV: "development",
      ALERTS_DEV_CHAT_ALLOWLIST: "owner-chat, tester-chat",
    });
    expect(telegram.canSendTo("owner-chat")).toBe(true);
    expect(telegram.canSendTo("tester-chat")).toBe(true);
    expect(telegram.canSendTo("real-subscriber")).toBe(false);
  });

  it("refuses the send itself, before touching the bot", async () => {
    const telegram = service({ NODE_ENV: "development" });
    await expect(telegram.sendMessage("real-subscriber", "hi")).rejects.toThrow(
      /ALERTS_DEV_CHAT_ALLOWLIST/,
    );
  });
});
