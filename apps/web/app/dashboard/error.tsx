"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/ui";

// One boundary for the whole console. Server Component errors arrive redacted
// in production, so this can't tell "session expired" from "ETL is down" — it
// shows whatever message survived and offers both exits.
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[console] error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
          error
        </span>
        <h1 className="text-center font-display text-xl font-bold text-danger">
          this screen failed to load
        </h1>
      </div>
      <pre className="max-w-[720px] overflow-x-auto border border-border bg-bg-card p-4 font-mono text-xs text-text-secondary">
        {error.message}
      </pre>
      <p className="max-w-[560px] text-center font-mono text-xs text-text-muted">
        an expired admin session or an unreachable ETL API both land here. check{" "}
        <code className="text-accent">NEXT_PUBLIC_API_URL</code>, or sign in again.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" size="sm" onClick={() => reset()}>
          retry
        </Button>
        <Link href="/">
          <Button variant="secondary" size="sm">
            sign in
          </Button>
        </Link>
      </div>
    </div>
  );
}
