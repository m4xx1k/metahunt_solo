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

export interface ConfirmAccountMergeRequest {
  code: string;
}

export interface AccountMergeStartResponse {
  code: string;
  expiresAt: string;
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

// `conflict` is revealed only after the poll secret proves the initiating
// browser. Unknown nonces, wrong secrets and spent requests all look expired.
export type TelegramLoginPollResponse =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "conflict" }
  | ({ status: "ready" } & TelegramLoginResponse);
