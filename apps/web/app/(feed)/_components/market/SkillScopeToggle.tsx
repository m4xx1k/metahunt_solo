"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

// Feed-only toggle that widens skill matching. Off (default): a selected skill
// must be must-have on the vacancy. On: the server page passes
// ?nice=true → includeOptionalSkills, so nice-to-have skills also match.
// Self-contained (writes the `nice` URL param directly) so it stays out of the
// shared FilterState the reverse-ATS bar also consumes — same pattern as
// DedupeToggle.
export function SkillScopeToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const on = searchParams.get("nice") === "true";

  const toggle = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (on) next.delete("nice");
    else next.set("nice", "true");
    next.delete("offset");
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }, [on, router, pathname, searchParams]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 border px-2 py-[2px] font-mono text-2xs uppercase tracking-wide transition-colors",
        isPending && "pointer-events-none opacity-50",
        on
          ? "border-accent-secondary bg-accent-secondary/10 text-accent-secondary"
          : "border-border text-text-muted hover:border-text-secondary hover:text-accent-secondary",
      )}
    >
      <span aria-hidden>{on ? "☑" : "☐"}</span>
      <span>nice-to-have</span>
    </button>
  );
}
