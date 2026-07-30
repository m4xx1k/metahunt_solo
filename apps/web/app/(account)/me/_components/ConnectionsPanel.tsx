"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { Panel } from "@/ui/layout/Panel";
import { ApiError } from "@/lib/api/client";
import { authApi, type AuthProvider, type AuthUser } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { GoogleLoginButton } from "@/features/auth/google-login-button";
import { TelegramLoginButton } from "@/features/auth/telegram-login-button";
import { useSession } from "@/features/auth/use-session";

const ROLE: Record<AuthProvider, string> = {
  telegram: "дайджести",
  google: "вхід без месенджера",
};
const PROVIDERS = Object.keys(ROLE) as AuthProvider[];

export function ConnectionsPanel({ user }: { user: AuthUser }) {
  const { setUser, user: sessionUser } = useSession();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const account = sessionUser ?? user;

  const linked = new Map(account.identities.map((i) => [i.provider, i]));
  const canUnlink = account.identities.length > 1;

  const apply = useCallback(
    async (provider: AuthProvider, run: () => Promise<AuthUser>, ok: string) => {
      if (busy) return;
      setBusy(provider);
      try {
        setUser(await run());
        toast.success(ok);
      } catch (err) {
        // 409 = this provider account is already someone else's sign-in. The one
        // error the user can act on, and the one worth counting (MET-82).
        if (err instanceof ApiError && err.status === 409) {
          analytics.identityLinkConflict(provider);
          toast.error(`${provider} уже підключено до іншого акаунта`);
        } else {
          toast.error("Не вдалося оновити");
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, setUser, analytics],
  );

  return (
    <Panel title="вхід">
      {account.email ? (
        <p className="break-all font-mono text-2xs text-text-secondary">{account.email}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => {
          const identity = linked.get(provider);
          const who = identity?.username ? `@${identity.username}` : identity?.firstName;
          return (
            <li
              key={provider}
              className="flex flex-col gap-3 border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-primary">
                  {provider}
                  {identity ? null : <span className="ml-2 text-text-muted">не підключено</span>}
                </span>
                <span className="truncate font-mono text-2xs text-text-muted">
                  {identity ? who || "підключено" : ROLE[provider]}
                </span>
              </div>

              <div className="shrink-0">
                {identity ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canUnlink || busy !== null}
                    title={canUnlink ? undefined : "єдиний спосіб входу"}
                    onClick={() =>
                      void apply(
                        provider,
                        async () => {
                          const next = await authApi.unlink(provider);
                          analytics.identityUnlinked(provider);
                          return next;
                        },
                        `${provider} відключено`,
                      )
                    }
                  >
                    disconnect
                  </Button>
                ) : provider === "google" ? (
                  <GoogleLoginButton
                    disabled={busy !== null}
                    onCredential={(credential) =>
                      apply(
                        "google",
                        async () => {
                          const next = await authApi.linkGoogle(credential);
                          analytics.identityLinked("google");
                          return next;
                        },
                        "Google підключено",
                      )
                    }
                  />
                ) : (
                  <TelegramLoginButton
                    flow="link"
                    disabled={busy !== null}
                    onInFlightChange={(inFlight) => setBusy(inFlight ? "telegram" : null)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!linked.has("telegram") ? (
        <p className="font-mono text-2xs leading-relaxed text-accent">
          Підключи Telegram для дайджестів
        </p>
      ) : null}

      <p className="font-mono text-2xs leading-relaxed text-text-muted">
        Уже підключений профіль не переноситься автоматично
      </p>
    </Panel>
  );
}
