"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { Panel } from "@/ui/layout/Panel";
import { ApiError } from "@/lib/api/client";
import { authApi, type AuthProvider, type AuthUser } from "@/lib/api/auth";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { GoogleLoginButton } from "@/features/auth/google-login-button";
import { TelegramWidgetButton } from "@/features/auth/telegram-widget-button";
import { useSession } from "@/features/auth/use-session";

const ROLE: Record<AuthProvider, string> = {
  telegram: "delivers your digests",
  google: "sign in without a messenger",
};
const PROVIDERS = Object.keys(ROLE) as AuthProvider[];

export function ConnectionsPanel({ user }: { user: AuthUser }) {
  const { setUser } = useSession();
  const analytics = useAnalytics();
  const [busy, setBusy] = useState<AuthProvider | null>(null);

  const linked = new Map(user.identities.map((i) => [i.provider, i]));
  const canUnlink = user.identities.length > 1;

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
          toast.error(`that ${provider} is already another account's sign-in`);
        } else {
          toast.error("could not update");
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, setUser, analytics],
  );

  return (
    <Panel title="sign-in">
      {user.email ? (
        <p className="break-all font-mono text-2xs text-text-secondary">{user.email}</p>
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
                    title={canUnlink ? undefined : "your only way back in"}
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
                        "google connected",
                      )
                    }
                  />
                ) : (
                  <TelegramWidgetButton
                    variant="secondary"
                    label="connect"
                    disabled={busy !== null}
                    onPayload={(payload) =>
                      apply(
                        "telegram",
                        async () => {
                          const next = await authApi.linkTelegram(payload);
                          analytics.identityLinked("telegram");
                          return next;
                        },
                        "telegram connected — digests will arrive there",
                      )
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!linked.has("telegram") ? (
        <p className="font-mono text-2xs leading-relaxed text-accent">
          connect telegram to receive digests — that is where they are sent
        </p>
      ) : null}

      {/* The unguessable part, and the only part worth saying here — the rest
          of the model lives in md/runbook/auth.md#linking-providers. */}
      <p className="font-mono text-2xs leading-relaxed text-text-muted">
        one account, two ways in — signing in elsewhere makes a second one, and they cannot be
        merged
      </p>
    </Panel>
  );
}
