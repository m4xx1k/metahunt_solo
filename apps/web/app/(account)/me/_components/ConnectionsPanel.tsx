"use client";

import { type ChangeEvent, useCallback, useState } from "react";
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
  telegram: "job messages",
  google: "login only",
};
const PROVIDERS = Object.keys(ROLE) as AuthProvider[];

export function ConnectionsPanel({ user }: { user: AuthUser }) {
  const { setUser, user: sessionUser } = useSession();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  const [mergeCode, setMergeCode] = useState("");
  const [issuedMergeCode, setIssuedMergeCode] = useState<string | null>(null);
  const account = sessionUser ?? user;

  const linked = new Map(account.identities.map((i) => [i.provider, i]));
  const canUnlink = account.identities.length > 1;

  const handleStartMerge = useCallback(async () => {
    try {
      const result = await authApi.startAccountMerge();
      setIssuedMergeCode(result.code);
      toast.success("Code made. It works for 10 minutes");
    } catch {
      toast.error("Could not make a code");
    }
  }, []);

  const handleConfirmMerge = useCallback(async () => {
    try {
      setUser(await authApi.confirmAccountMerge(mergeCode));
      setMergeCode("");
      toast.success("Accounts joined");
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 409
          ? "These accounts cannot be joined"
          : "Bad or old code",
      );
    }
  }, [mergeCode, setUser]);

  const handleMergeCodeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setMergeCode(event.target.value.toUpperCase());
  }, []);

  const handleStartMergeClick = useCallback(() => {
    void handleStartMerge();
  }, [handleStartMerge]);

  const handleConfirmMergeClick = useCallback(() => {
    void handleConfirmMerge();
  }, [handleConfirmMerge]);

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
          toast.error(`${provider} is already on another account`);
        } else {
          toast.error("Could not save");
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, setUser, analytics],
  );

  return (
    <Panel title="login">
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
                  {identity ? null : <span className="ml-2 text-text-muted">not connected</span>}
                </span>
                <span className="truncate font-mono text-2xs text-text-muted">
                  {identity ? who || "connected" : ROLE[provider]}
                </span>
              </div>

              <div className="shrink-0">
                {identity ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canUnlink || busy !== null}
                    title={canUnlink ? undefined : "your only login"}
                    onClick={() =>
                      void apply(
                        provider,
                        async () => {
                          const next = await authApi.unlink(provider);
                          analytics.identityUnlinked(provider);
                          return next;
                        },
                        `${provider} disconnected`,
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
                        "Google connected",
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
          Connect Telegram to get job messages
        </p>
      ) : null}

      <p className="font-mono text-2xs leading-relaxed text-text-muted">
        A profile that is already connected does not move by itself.
      </p>

      <div className="border-t border-border pt-4">
        <p className="font-mono text-2xs leading-relaxed text-text-muted">
          If Telegram and Google made two accounts: log in to the one you want to move, make a code,
          then log in here and use it. The data moves to this account.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleStartMergeClick}>
            make a code
          </Button>
          {issuedMergeCode ? (
            <code className="border border-border bg-bg px-2 py-1 font-mono text-xs text-accent">
              {issuedMergeCode}
            </code>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={mergeCode}
            onChange={handleMergeCodeChange}
            placeholder="code from the other account"
            aria-label="merge code"
            className="border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-accent"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={mergeCode.trim().length === 0}
            onClick={handleConfirmMergeClick}
          >
            move it here
          </Button>
        </div>
      </div>
    </Panel>
  );
}
