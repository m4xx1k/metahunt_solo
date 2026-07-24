"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: string };

// Segmented control bound to one query param. Unlike <UrlTabs> this commits a
// real navigation (router.replace), because the selection changes what the
// server has to fetch. The default value is kept out of the URL so a bare
// /dashboard link stays canonical.
export function UrlSegments<T extends string>({
  param,
  value,
  options,
  defaultValue,
  label,
}: {
  param: string;
  value: T;
  options: Array<SegmentOption<T>>;
  defaultValue?: T;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(next: T) {
    if (next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete(param);
    else params.set(param, next);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex border border-border bg-bg-card font-mono text-xs transition-opacity",
        pending && "opacity-60",
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => select(option.value)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              active
                ? "bg-text-primary font-bold text-bg"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
