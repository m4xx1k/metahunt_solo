import { createHash, createHmac } from "node:crypto";

import { verifyTelegramAuth, type TelegramAuthPayload } from "./telegram-verify";

const BOT_TOKEN = "123456:test-bot-token";

// Reproduce Telegram's signing so we can assert the verifier accepts genuine
// payloads and rejects tampered/stale/wrong-token ones.
function sign(
  fields: Record<string, string | number>,
  token = BOT_TOKEN,
): TelegramAuthPayload {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return { ...fields, hash } as unknown as TelegramAuthPayload;
}

const nowSec = () => Math.floor(Date.now() / 1000);

describe("verifyTelegramAuth", () => {
  it("accepts a correctly signed, fresh payload", () => {
    const payload = sign({
      id: 42,
      first_name: "Max",
      username: "maxxik",
      auth_date: nowSec(),
    });
    expect(verifyTelegramAuth(payload, BOT_TOKEN)).toBe(true);
  });

  it("rejects a tampered hash", () => {
    const payload = sign({ id: 42, auth_date: nowSec() });
    const flipped = (payload.hash[0] === "a" ? "b" : "a") + payload.hash.slice(1);
    expect(verifyTelegramAuth({ ...payload, hash: flipped }, BOT_TOKEN)).toBe(
      false,
    );
  });

  it("rejects a payload whose field changed after signing", () => {
    const payload = sign({ id: 42, auth_date: nowSec() });
    expect(verifyTelegramAuth({ ...payload, id: 99 }, BOT_TOKEN)).toBe(false);
  });

  it("rejects a stale auth_date (> 24h)", () => {
    const payload = sign({ id: 42, auth_date: nowSec() - 90_000 });
    expect(verifyTelegramAuth(payload, BOT_TOKEN)).toBe(false);
  });

  it("rejects a payload signed with a different bot token", () => {
    const payload = sign({ id: 42, auth_date: nowSec() }, "999:other-token");
    expect(verifyTelegramAuth(payload, BOT_TOKEN)).toBe(false);
  });
});
