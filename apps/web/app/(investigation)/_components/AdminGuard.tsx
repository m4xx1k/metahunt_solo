"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/features/auth/use-session";

// Client-side operator gate (replaces Clerk): needs a Telegram 'admin' session,
// else bounces home. Not an edge/SSR gate — pages still SSR-render and read APIs
// stay open; cookie-based gating of reads is deferred.
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, roles } = useSession();
  const router = useRouter();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace("/");
  }, [isLoading, isAdmin, router]);

  if (isLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
          {isLoading ? "checking access…" : "not authorized"}
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
