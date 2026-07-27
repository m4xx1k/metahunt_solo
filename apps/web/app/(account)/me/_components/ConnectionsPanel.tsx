"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/ui";
import { authApi, type AuthProvider, type AuthUser } from "@/lib/api/auth";
import { GoogleLoginButton } from "@/features/auth/google-login-button";
import { TelegramWidgetButton } from "@/features/auth/telegram-widget-button";
import { useSession } from "@/features/auth/use-session";

export function ConnectionsPanel({ user }: { user: AuthUser }) {
  const { setUser } = useSession();
  const [busy, setBusy] = useState<AuthProvider | null>(null);

  const canUnlink = user.identities.length > 1;

  const apply = useCallback(
    async (provider: AuthProvider, run: () => Promise<AuthUser>, ok: string) => {
      setBusy(provider);
      try {
        setUser(await run());
        toast.success(ok);
      } catch (err) {
        // The 409 ("already linked elsewhere") is the one the user can act on.
        const conflict = err instanceof Error && err.message.includes("409");
        toast.error(
          conflict ? `that ${provider} account belongs to someone else` : "could not update",
        );
      } finally {
        setBusy(null);
      }
    },
    [setUser],
  );

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-mono text-2xs uppercase tracking-wider text-text-muted">sign-in</h2>

      {user.email ? <p className="font-mono text-2xs text-text-secondary">{user.email}</p> : null}

      <ul className="flex flex-col divide-y divide-border border border-border bg-bg-card">
        {(["telegram", "google"] as const).map((provider) => {
          const identity = user.identities.find((i) => i.provider === provider);
          return (
            <li key={provider} className="flex items-center justify-between gap-3 p-4">
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-2xs uppercase tracking-wider text-text-primary">
                  {provider}
                </span>
                <span className="font-mono text-2xs text-text-muted">
                  {identity
                    ? (identity.username ? `@${identity.username}` : identity.firstName) ||
                      "connected"
                    : "not connected"}
                </span>
              </div>

              {identity ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canUnlink || busy !== null}
                  onClick={() =>
                    void apply(provider, () => authApi.unlink(provider), `${provider} removed`)
                  }
                  // The last method is what still lets them back in.
                  title={canUnlink ? undefined : "your only sign-in method"}
                >
                  disconnect
                </Button>
              ) : provider === "google" ? (
                <GoogleLoginButton
                  onCredential={(credential) =>
                    apply("google", () => authApi.linkGoogle(credential), "google connected")
                  }
                />
              ) : (
                <TelegramWidgetButton
                  variant="secondary"
                  label="connect"
                  onPayload={(payload) =>
                    apply(
                      "telegram",
                      () => authApi.linkTelegram(payload),
                      "telegram connected — digests will arrive there",
                    )
                  }
                />
              )}
            </li>
          );
        })}
      </ul>

      {!user.identities.some((i) => i.provider === "telegram") ? (
        <p className="font-mono text-2xs text-text-secondary">
          connect telegram to get digests — that is where they are delivered
        </p>
      ) : null}
    </section>
  );
}
