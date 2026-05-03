import * as React from "react";
import { cn } from "@/lib/utils";

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={cn(
        "flex w-full max-w-[400px] items-center gap-3 border border-border bg-bg-card px-4 py-3 shadow-[4px_4px_0_0_#000] focus-within:border-accent",
        className,
      )}
    >
      <span className="font-body text-lg text-text-secondary">⌕</span>
      <input
        type="search"
        placeholder="Search for skills..."
        className="w-full bg-transparent font-body text-sm text-text-primary outline-none placeholder:text-text-muted"
        {...props}
      />
    </label>
  );
}
