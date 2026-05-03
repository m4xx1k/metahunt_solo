"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import type { Source } from "@/lib/api/monitoring";
import { Button } from "@/components/ui-kit";

export function RecordsFilters({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const sourceId = sp.get("sourceId") ?? "";
  const extracted = sp.get("extracted") ?? "";
  const q = sp.get("q") ?? "";

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v && v.length > 0) params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/monitoring?${qs}` : "/monitoring");
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    apply({
      sourceId: String(data.get("sourceId") ?? ""),
      extracted: String(data.get("extracted") ?? ""),
      q: String(data.get("q") ?? "").trim(),
    });
  }

  function onReset() {
    apply({});
  }

  const inputBase =
    "border border-border bg-bg-card px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent disabled:opacity-50";

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 border border-border bg-bg-card p-4 shadow-[4px_4px_0_0_#000]"
    >
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          source
        </span>
        <select
          name="sourceId"
          defaultValue={sourceId}
          disabled={pending}
          className={inputBase}
        >
          <option value="">all sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          extracted
        </span>
        <select
          name="extracted"
          defaultValue={extracted}
          disabled={pending}
          className={inputBase}
        >
          <option value="">any</option>
          <option value="true">extracted</option>
          <option value="false">pending</option>
        </select>
      </label>

      <label className="flex flex-1 min-w-[200px] flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          search title
        </span>
        <input
          name="q"
          defaultValue={q}
          disabled={pending}
          placeholder="e.g. fullstack node"
          className={inputBase}
        />
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "applying…" : "apply"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={onReset}
        >
          reset
        </Button>
      </div>
    </form>
  );
}
