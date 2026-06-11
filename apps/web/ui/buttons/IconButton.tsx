import * as React from "react";
import { cn } from "@/lib/utils";

export function IconButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex h-12 w-12 items-center justify-center border border-border bg-accent text-bg shadow-[2px_2px_0_0_#000] transition-[transform,box-shadow] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:translate-x-[2px] active:translate-y-[2px]",
        className,
      )}
      {...props}
    >
      {children ?? <span className="font-display text-xl font-bold">→</span>}
    </button>
  );
}
