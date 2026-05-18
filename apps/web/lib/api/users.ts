// Web-side wire types + fetcher for the waitlist signup API.
// Source of truth: apps/etl/src/users/users.contract.ts.
// Hand-mirrored per ADR-0005.

export type SignupSource = "landing-cta";

export interface SubscribeRequest {
  email: string;
  source: SignupSource;
}

export type SubscribeStatus = "subscribed" | "already_subscribed";

export interface SubscribeResponse {
  status: SubscribeStatus;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  const url = `${base.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`users api ${res.status} ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

export const usersApi = {
  subscribe: (email: string, source: SignupSource = "landing-cta") =>
    post<SubscribeResponse>("/users/subscribe", { email, source }),
};
