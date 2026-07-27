// Web-side wire types + fetchers for Telegram auth. Source of truth:
// apps/etl/src/platform/auth/auth.contract.ts. Hand-mirrored per ADR-0005.

import { apiDelete, apiGet, apiPost } from "./client";

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

export type AuthProvider = "telegram" | "google";

export interface AuthIdentity {
  provider: AuthProvider;
  username: string | null;
  firstName: string | null;
  linkedAt: string;
}

export interface AuthUser {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  email: string | null;
  roles: string[];
  identities: AuthIdentity[];
}

// What Google Identity Services hands the callback. `credential` is the ID token.
export interface GoogleCredentialResponse {
  credential: string;
}

export interface TelegramLoginResponse {
  token: string;
  user: AuthUser;
  isNewUser: boolean;
}

export interface TelegramLoginStartResponse {
  nonce: string;
  pollSecret: string;
  verificationCode: string;
  startPayload: string;
}

export type TelegramLoginPollResponse =
  { status: "pending" } | { status: "expired" } | ({ status: "ready" } & TelegramLoginResponse);

export const authApi = {
  loginTelegram: (telegram: TelegramAuthPayload) =>
    apiPost<TelegramLoginResponse>("/auth/telegram", { telegram }),
  startTelegramLogin: () => apiPost<TelegramLoginStartResponse>("/auth/telegram/start", {}),
  pollTelegramLogin: (nonce: string, pollSecret: string) =>
    apiPost<TelegramLoginPollResponse>("/auth/telegram/poll", { nonce, pollSecret }),
  loginGoogle: (credential: string) =>
    apiPost<TelegramLoginResponse>("/auth/google", { credential }),
  linkGoogle: (credential: string) => apiPost<AuthUser>("/auth/link/google", { credential }),
  linkTelegram: (telegram: TelegramAuthPayload) =>
    apiPost<AuthUser>("/auth/link/telegram", { telegram }),
  unlink: (provider: AuthProvider) => apiDelete<AuthUser>(`/auth/link/${provider}`),
  me: () => apiGet<AuthUser>("/auth/me"),
  logout: () => apiPost<{ ok: true }>("/auth/logout", {}),
};
