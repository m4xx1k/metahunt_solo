import type { TelegramAuthPayload } from "./telegram-verify";

// POST /auth/telegram — Telegram widget payload only. CVs are created for an
// authenticated account and cannot be claimed with a browser-provided UUID.
export interface TelegramLoginRequest {
  telegram: TelegramAuthPayload;
}

// Public shape of the logged-in user (no secrets). `username`/`firstName` come
// from the Telegram profile snapshot on auth_identities.
export interface AuthUser {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  roles: string[];
}

export interface TelegramLoginResponse {
  token: string;
  user: AuthUser;
}
