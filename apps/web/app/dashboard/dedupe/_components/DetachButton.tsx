"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError } from "@/lib/api/client";
import { dedupApi } from "@/lib/api/dedup";

const LABEL = "font-mono text-2xs uppercase tracking-wider text-text-muted";

type State = { kind: "idle" | "pending" | "failed" | "queued" } | { kind: "done"; groupId: string };

// Operator verdict "not the same job": saved as an override, so every later
// rebuild keeps this posting out of the group. The result shows as soon as the
// API answers; the page refresh that drops the member follows on its own.
export function DetachButton({ groupId, vacancyId }: { groupId: string; vacancyId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  const detach = async () => {
    setState({ kind: "pending" });
    try {
      const res = await dedupApi.detach(groupId, vacancyId);
      setState({ kind: "done", groupId: res.groupId });
      router.refresh();
    } catch (err) {
      // 409: the group changed meanwhile; the verdict is saved and the next sweep applies it.
      setState({ kind: err instanceof ApiError && err.status === 409 ? "queued" : "failed" });
    }
  };

  if (state.kind === "queued") return <span className={LABEL}>saved · rebuilds soon</span>;
  if (state.kind === "done") {
    return (
      <Link
        href={`/dashboard/dedupe?group=${state.groupId}`}
        className={`${LABEL} text-accent underline-offset-2 hover:underline`}
      >
        detached → new group
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={detach}
      disabled={state.kind === "pending"}
      className={`${LABEL} underline-offset-2 hover:text-danger hover:underline disabled:opacity-50`}
    >
      {state.kind === "pending"
        ? "detaching…"
        : state.kind === "failed"
          ? "retry detach"
          : "detach"}
    </button>
  );
}
