"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

// Search box whose term lives in a query param, committed on submit so a
// server screen refetches once instead of on every keystroke. The input stays
// uncontrolled (keyed on the committed term, so an external URL change
// remounts it) — the URL is the state. Paging resets: a new term is a new
// result set.
export function UrlSearch({
  param = "q",
  placeholder = "search",
  className,
}: {
  param?: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const committed = searchParams.get(param) ?? "";

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("offset");
    if (next.trim()) params.set(param, next.trim());
    else params.delete(param);
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        commit(String(data.get(param) ?? ""));
      }}
      className={cn(
        "flex items-center gap-2 border border-border bg-bg-card px-2.5 py-1.5",
        pending && "opacity-60",
        className,
      )}
    >
      <Search aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
      <input
        key={committed}
        type="search"
        name={param}
        defaultValue={committed}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-40 bg-transparent font-mono text-xs text-text-primary outline-none placeholder:text-text-muted md:w-56"
      />
      {committed ? (
        <button
          type="button"
          aria-label="clear search"
          onClick={() => commit("")}
          className="text-text-muted transition-colors hover:text-accent"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </form>
  );
}
