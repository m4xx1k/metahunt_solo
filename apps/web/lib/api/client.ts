// Shared backend boundary. Every lib/api fetcher goes through these:
// one place resolves the base URL, builds the query string, and turns a
// non-2xx response into a thrown error. Resource files only declare their
// wire types + endpoint paths. (Taxonomy mutations keep their own typed
// error path — see TaxonomyApiError.)

import { getToken } from "./auth-token";
import { SESSION_COOKIE } from "./session-cookie";

// Attach the session JWT when present. Client-side calls read the localStorage
// Bearer token; server-side calls (Server Components rendering (investigation)
// admin pages) forward the httpOnly cookie set by POST /api/session instead,
// since localStorage never reaches the server. Dynamic import keeps
// next/headers out of the client bundle — this file is also imported from
// Client Components (e.g. use-session.ts).
async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function apiBase(): string {
  // Server renders (in-container SSR) prefer an internal URL that resolves over
  // the docker network; the browser always uses the public one. Native dev sets
  // no internal var, so both paths fall back to NEXT_PUBLIC_API_URL.
  const base =
    typeof window === "undefined"
      ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL)
      : process.env.NEXT_PUBLIC_API_URL;
  return normalizeApiBase(base);
}

// URLs rendered into HTML must use the public origin on both server and client.
// `API_INTERNAL_URL` is only safe for server-to-server fetches.
export function publicApiBase(): string {
  return normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);
}

function normalizeApiBase(base: string | undefined): string {
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  return base.replace(/\/+$/, "");
}

// Skips undefined/null/"" and non-primitive values; repeats array values
// as multiple params (?skills=a&skills=b). Returns "" or "?<qs>".
export function buildQs(params?: object): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item));
      continue;
    }
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const base = init ?? { cache: "no-store" };
  const res = await fetch(`${apiBase()}${path}`, {
    ...base,
    headers: { ...(await authHeaders()), ...(base.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

async function apiWrite<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`api ${res.status} ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

export const apiPost = <T>(path: string, body: unknown, init?: RequestInit): Promise<T> =>
  apiWrite<T>("POST", path, body, init);

export const apiPatch = <T>(path: string, body: unknown): Promise<T> =>
  apiWrite<T>("PATCH", path, body);

export const apiDelete = <T>(path: string): Promise<T> => apiWrite<T>("DELETE", path);
