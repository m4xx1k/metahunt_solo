"use client";

import Link from "next/link";

import { TelegramLoginButton } from "./telegram-login-button";
import { useSession } from "./use-session";

// Header auth slot. Logged out → a direct blue "log in with telegram" button
// (click = login, no intermediate menu). Logged in → a @username chip linking to
// the account page (/me), where logout lives.
export function HeaderAuth() {
  const { isLoggedIn, isLoading, user } = useSession();

  if (isLoading) return null;

  if (isLoggedIn) {
    const label = user?.username ? `@${user.username}` : "my account";
    return (
      <Link
        href="/me"
        className="border border-border bg-bg-card px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-text-secondary shadow-brut-sm transition-colors hover:text-accent"
      >
        {label}
      </Link>
    );
  }

  return <TelegramLoginButton />;
}
