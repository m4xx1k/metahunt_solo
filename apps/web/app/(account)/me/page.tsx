"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/ui";
import { TelegramLoginButton } from "@/features/auth/telegram-login-button";
import { useSession } from "@/features/auth/use-session";
import { MyCvPanel } from "./_components/MyCvPanel";
import { SubscriptionList } from "./_components/SubscriptionList";

// The logged-in dashboard. Client-rendered because the session token is in
// localStorage (Bearer) — SSR has no token. Guards inline: prompt to log in when
// there's no session rather than hard-redirecting.
export default function MePage() {
  const { isLoggedIn, isLoading, user, logout } = useSession();
  const router = useRouter();

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
      <div className="flex items-center justify-between border-b border-border pb-4">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          {user?.username ? `@${user.username}` : "logged in"}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void logout();
            router.replace("/");
          }}
        >
          log out
        </Button>
      </div>
      <MyCvPanel />
      <SubscriptionList />
    </div>
  );
}
