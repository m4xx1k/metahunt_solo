import type { TelegramAuthPayload } from "./telegram-verify";

// POST /auth/telegram — the widget payload plus any anonymous candidateIds the
// browser wants claimed onto the new session.
export interface TelegramLoginRequest {
  telegram: TelegramAuthPayload;
  candidateIds?: string[];
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
