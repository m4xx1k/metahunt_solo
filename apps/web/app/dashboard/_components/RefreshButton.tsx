"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

// Re-runs the current screen's server fetches without a full reload.
export function RefreshButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={pending}
      className="inline-flex items-center gap-2 border border-border px-2.5 py-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    >
      <RefreshCw aria-hidden="true" className={cn("size-3", pending && "animate-spin")} />
      {label}
    </button>
  );
}
