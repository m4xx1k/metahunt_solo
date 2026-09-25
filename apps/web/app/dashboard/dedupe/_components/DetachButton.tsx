"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ApiError } from "@/lib/api/client";
import { dedupApi } from "@/lib/api/dedup";

// Operator verdict "not the same job": saved as an override, so every later
// rebuild keeps this posting out of the group.
export function DetachButton({ groupId, vacancyId }: { groupId: string; vacancyId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<"idle" | "failed" | "queued">("idle");

  // 409: the group changed meanwhile; the verdict is saved and the next sweep applies it.
  const detach = () =>
    startTransition(async () => {
      try {
        await dedupApi.detach(groupId, vacancyId);
        setState("idle");
        router.refresh();
      } catch (err) {
        setState(err instanceof ApiError && err.status === 409 ? "queued" : "failed");
      }
    });

  if (state === "queued") {
    return (
      <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        saved · rebuilds soon
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={detach}
      disabled={pending}
      className="font-mono text-2xs uppercase tracking-wider text-text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      {pending ? "detaching…" : state === "failed" ? "retry detach" : "detach"}
    </button>
  );
}
