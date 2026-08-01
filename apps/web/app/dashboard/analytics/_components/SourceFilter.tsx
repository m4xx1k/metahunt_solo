"use client";

import { type ChangeEvent, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { AnalyticsPageSource } from "@/lib/api/analytics-page";
import { cn } from "@/lib/utils";

// The source list is data-driven, so UrlSegments cannot render this picker.
export function SourceFilter({
  sources,
  value,
}: {
  sources: AnalyticsPageSource[];
  value: string | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("offset");
    if (next) params.set("source", next);
    else params.delete("source");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    select(event.target.value);
  }

  return (
    <select
      aria-label="traffic source"
      value={value ?? ""}
      onChange={handleChange}
      className={cn(
        "border border-border bg-bg-card px-3 py-1.5 font-mono text-xs text-text-secondary outline-none transition-opacity focus:border-accent",
        pending && "opacity-60",
      )}
    >
      <option value="">all sources</option>
      {sources.map((row) => (
        <option key={row.source} value={row.source}>
          {row.source} · {row.people}
        </option>
      ))}
    </select>
  );
}
