"use client";

import { TelegramLoginButton } from "@/features/auth/telegram-login-button";
import { useSession } from "@/features/auth/use-session";
import { MyCvPanel } from "./_components/MyCvPanel";
import { SubscriptionList } from "./_components/SubscriptionList";

// The logged-in dashboard. Client-rendered because the session token is in
// localStorage (Bearer) — SSR has no token. Guards inline: prompt to log in when
// there's no session rather than hard-redirecting.
export default function MePage() {
  const { isLoggedIn, isLoading } = useSession();

  if (isLoading) {
    return (
      <p className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        loading…
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="mx-auto max-w-sm border border-border bg-bg-card p-6 shadow-brut">
        <h1 className="mb-2 font-display text-lg text-text-primary">
          log in to see your saved
        </h1>
        <p className="mb-4 font-mono text-2xs uppercase tracking-wider text-text-secondary">
          your CV match + telegram alerts live here
        </p>
        <TelegramLoginButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <MyCvPanel />
      <SubscriptionList />
    </div>
  );
}
