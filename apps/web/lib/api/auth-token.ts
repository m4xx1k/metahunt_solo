// Single home for the session JWT. Stored in localStorage (Bearer scheme, no
// cookies) and read by lib/api/client.ts on every request. SSR-safe: no window
// on the server means no token, which is correct — authed reads run client-side.

const KEY = "metahunt.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    /* private mode / quota — session stays in memory only */
  }
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
