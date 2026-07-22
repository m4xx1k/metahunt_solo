"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/ui";

// Fallback for (investigation) routes without their own error.tsx (dashboard
// has a more specific one). Server Component errors arrive with a redacted
// message in production (Next.js strips details), so this can't reliably
// distinguish "unauthorized" from other failures — it just avoids an
// unhandled crash and points the operator back to the login flow.
export default function InvestigationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[investigation] error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-6">
      <h1 className="font-display text-2xl font-bold text-danger">
        не вдалося завантажити сторінку
      </h1>
      <p className="max-w-[600px] text-center font-mono text-xs text-text-muted">
        можливо, сесія адміністратора недійсна або застаріла. увійдіть під telegram-акаунтом з роллю
        admin і спробуйте ще раз.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" size="md" onClick={() => reset()}>
          повторити
        </Button>
        <Link href="/">
          <Button variant="secondary" size="md">
            на головну, щоб увійти
          </Button>
        </Link>
      </div>
    </main>
  );
}
