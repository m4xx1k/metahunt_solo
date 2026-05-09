"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui-kit";

export default function MonitoringError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[monitoring] error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg p-6">
      <h1 className="font-display text-3xl font-bold text-danger">
        monitoring api unavailable
      </h1>
      <pre className="max-w-[800px] overflow-x-auto border border-danger bg-bg-card p-4 font-mono text-xs text-text-primary">
        {error.message}
      </pre>
      <p className="max-w-[600px] text-center font-mono text-xs text-text-muted">
        check that the ETL backend is running and that{" "}
        <code className="text-accent">NEXT_PUBLIC_API_URL</code> points at it.
      </p>
      <Button variant="primary" size="md" onClick={() => reset()}>
        retry
      </Button>
    </main>
  );
}
