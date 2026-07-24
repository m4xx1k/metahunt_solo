"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/features/auth/use-session";

// Client-side operator gate (replaces Clerk): needs a Telegram 'admin' session,
// else bounces home. Belt-and-suspenders on top of the SSR checks in
// layout.tsx (no-session redirect) and error.tsx (unauthorized/forbidden
// fallback) — this catches a valid-but-non-admin session once the client
// hydrates and the role is known.
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
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
          {isLoading ? "checking access…" : "not authorized"}
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
