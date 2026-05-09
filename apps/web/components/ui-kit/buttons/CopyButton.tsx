"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  ariaLabel?: string;
  className?: string;
};

export function CopyButton({
  value,
  ariaLabel = "copy to clipboard",
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard rejected (insecure context, perm denial); swallow.
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-[2px] font-mono text-[11px] uppercase tracking-wider transition-colors",
        copied
          ? "border-success text-success"
          : "border-border bg-bg-elev text-text-muted hover:border-accent hover:text-accent",
        className,
      )}
    >
      {copied ? "✓ copied" : "⧉ copy"}
    </button>
  );
}
