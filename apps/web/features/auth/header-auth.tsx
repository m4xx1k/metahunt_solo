"use client";

import Link from "next/link";

import { AuthChoice } from "./auth-choice";
import { useSession } from "./use-session";

// Header auth slot. Logged out → one "sign in" button that opens the provider
// choice. Logged in → an accented chip linking to /me, where logout lives.
export function HeaderAuth() {
  const { isLoggedIn, isLoading, user } = useSession();

  if (isLoading) return null;

  if (isLoggedIn) {
    const label = user?.username ? `@${user.username}` : (user?.firstName ?? "my account");
    return (
      <Link
        href="/me"
        className="border border-accent bg-bg-card px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-accent shadow-brut-sm transition-[transform,box-shadow,background-color] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-accent hover:text-bg hover:shadow-brut-2xs"
      >
        {label}
      </Link>
    );
  }

  return <AuthChoice align="end" />;
}
