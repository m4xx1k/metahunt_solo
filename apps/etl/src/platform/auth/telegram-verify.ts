import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Telegram Login Widget payload. Numbers/strings arrive verbatim from the
// widget; `hash` is the HMAC we verify. https://core.telegram.org/widgets/login
export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
  [key: string]: unknown;
}

// Reject payloads older than this (replay guard). Telegram signs `auth_date`.
const MAX_AUTH_AGE_SECONDS = 86_400;

// Verify per Telegram's spec: secret = SHA256(botToken); the expected hash is
// HMAC_SHA256(data_check_string, secret) where data_check_string is every field
// except `hash` as "k=v", sorted by key, joined by "\n".
export function verifyTelegramAuth(payload: TelegramAuthPayload, botToken: string): boolean {
  const { hash } = payload;
  if (typeof hash !== "string" || !/^[0-9a-f]+$/i.test(hash)) return false;

  const dataCheckString = Object.keys(payload)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${String(payload[k])}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const gotBuf = Buffer.from(hash, "hex");
  if (expectedBuf.length !== gotBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, gotBuf)) return false;

  const authDate = Number(payload.auth_date);
  if (!Number.isFinite(authDate)) return false;
  const ageSeconds = Date.now() / 1000 - authDate;
  return ageSeconds >= 0 && ageSeconds <= MAX_AUTH_AGE_SECONDS;
}
