"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authApi, type AuthUser, type TelegramLoginResponse } from "@/lib/api/auth";
import { clearToken, getToken, setToken } from "@/lib/api/auth-token";

const SESSION_KEY = ["auth", "me"] as const;

// Client session state. Reads the localStorage token, resolves the user via
// /auth/me, and exposes login/logout. A stale/invalid token self-clears. Shared
// across the header + account pages through the React Query cache.
export function useSession() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AuthUser | null>({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      if (!getToken()) return null;
      try {
        return await authApi.me();
      } catch {
        clearToken();
        return null;
      }
    },
    staleTime: 5 * 60_000,
  });

  const login = useCallback(
    (res: TelegramLoginResponse) => {
      setToken(res.token);
      // Mirror the token into an httpOnly cookie so (investigation) Server
      // Components can forward it — localStorage never reaches the server.
      void fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: res.token }),
      });
      qc.setQueryData(SESSION_KEY, res.user);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort — token is dropped regardless */
    }
    clearToken();
    void fetch("/api/session", { method: "DELETE" });
    qc.setQueryData(SESSION_KEY, null);
    // Drop any user-scoped cached data (/me lists) so nothing leaks post-logout.
    void qc.invalidateQueries({ queryKey: ["me"] });
  }, [qc]);

  const user = data ?? null;
  return {
    user,
    isLoggedIn: Boolean(user),
    isLoading,
    roles: user?.roles ?? [],
    login,
    logout,
  };
}
