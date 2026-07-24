import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

// The console's drill-down affordance: every widget footer that opens a fuller
// screen uses this, so "there is more behind this panel" always looks the same.
export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-text-secondary transition-colors hover:text-accent"
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-3 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
