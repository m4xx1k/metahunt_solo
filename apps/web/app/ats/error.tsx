"use client";

import { useEffect } from "react";

import { Button } from "@/ui";
import { PageBody } from "@/ui/layout/PageBody";

export default function AtsError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("[ats] page failed", error);
  }, [error]);
  return (
    <PageBody>
      <div className="flex flex-col items-start gap-4 border border-danger/60 bg-bg-card p-6">
        <p className="font-display text-lg font-bold text-danger">ATS view failed to load</p>
        <p className="font-mono text-xs text-text-muted">{error.message}</p>
        <Button variant="secondary" size="sm" onClick={reset}>
          retry
        </Button>
      </div>
    </PageBody>
  );
}
