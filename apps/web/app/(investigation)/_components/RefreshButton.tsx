"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Button } from "@/components/ui-kit";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onRefresh}
      disabled={pending}
    >
      {pending ? "refreshing…" : "↻ refresh"}
    </Button>
  );
}
