import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

// Breadcrumb-of-one above a detail screen's title.
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-accent"
    >
      <ArrowLeft aria-hidden="true" className="size-3" />
      {children}
    </Link>
  );
}
