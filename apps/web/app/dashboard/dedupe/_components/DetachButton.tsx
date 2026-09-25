"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { dedupApi } from "@/lib/api/dedup";

// Operator verdict "not the same job": saved as an override, so every later
// rebuild keeps this posting out of the group.
export function DetachButton({ groupId, vacancyId }: { groupId: string; vacancyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const detach = () =>
    startTransition(async () => {
      try {
        await dedupApi.detach(groupId, vacancyId);
        setFailed(false);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });

  return (
    <button
      type="button"
      onClick={detach}
      disabled={pending}
      className="font-mono text-2xs uppercase tracking-wider text-text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      {pending ? "detaching…" : failed ? "retry detach" : "detach"}
    </button>
  );
}
