// Web-side wire types + fetchers for Telegram auth. Source of truth:
// apps/etl/src/platform/auth/auth.contract.ts. Hand-mirrored per ADR-0005.

import { apiGet, apiPost } from "./client";

// The Telegram Login Widget callback payload (what Telegram.Login.auth returns).
export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

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

export const authApi = {
  // candidateIds: anonymous CVs from localStorage to claim onto the new session.
  loginTelegram: (telegram: TelegramAuthPayload, candidateIds: string[]) =>
    apiPost<TelegramLoginResponse>("/auth/telegram", { telegram, candidateIds }),
  me: () => apiGet<AuthUser>("/auth/me"),
  logout: () => apiPost<{ ok: true }>("/auth/logout", {}),
};
