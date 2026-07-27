import type { TelegramAuthPayload } from "./telegram-verify";

// POST /auth/telegram — Telegram widget payload only. CVs are created for an
// authenticated account and cannot be claimed with a browser-provided UUID.
export interface TelegramLoginRequest {
  telegram: TelegramAuthPayload;
}

export type AuthProvider = "telegram" | "google";

export interface AuthIdentitySummary {
  provider: AuthProvider;
  username: string | null;
  firstName: string | null;
  linkedAt: string;
}

// Public shape of the logged-in user (no secrets). `telegramId`/`username`/
// `firstName` stay flat for the header chip; `identities` is what the account
// page reads to render connect/disconnect per provider.
export interface AuthUser {
  id: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  email: string | null;
  roles: string[];
  identities: AuthIdentitySummary[];
}

// POST /auth/google — the `credential` an ID-token client hands back.
export interface GoogleLoginRequest {
  credential: string;
}

export interface TelegramLoginResponse {
  token: string;
  user: AuthUser;
  // First-ever login for this Telegram identity — the client's signal to emit
  // the `signup` analytics event exactly once, on the identified person.
  isNewUser: boolean;
}

// POST /auth/telegram/start — no body. The browser keeps `pollSecret`, shows
// `verificationCode`, and sends the user to `t.me/<bot>?start=<startPayload>`.
export interface TelegramLoginStartResponse {
  nonce: string;
  pollSecret: string;
  verificationCode: string;
  startPayload: string;
}

export interface TelegramLoginPollRequest {
  nonce: string;
  pollSecret: string;
}

// `pending` = the user hasn't finished in Telegram yet. `expired` covers every
// other outcome (unknown nonce, wrong secret, spent request) deliberately —
// distinguishing them would leak whether a nonce exists.
export type TelegramLoginPollResponse =
  { status: "pending" } | { status: "expired" } | ({ status: "ready" } & TelegramLoginResponse);
