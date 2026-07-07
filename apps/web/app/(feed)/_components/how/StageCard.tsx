import type { ReactNode } from "react";
import Link from "next/link";

// Neo-brutalist stage box shared by all three stages; the animated visual is
// passed as `children`, `href` deep-links to the matching /how-it-works section.

export function GridBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.14]"
      style={{
        backgroundImage:
          "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}

export function StageCard({
  n,
  label,
  sub,
  href,
  children,
}: {
  n: string;
  label: string;
  sub: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[340px] flex-1 flex-col overflow-hidden border border-border-strong bg-bg-card shadow-brut-lg">
      <div className="relative z-[5] flex items-center justify-between px-[18px] pt-4">
        <span className="font-mono text-xs font-bold tracking-[0.1em] text-accent">
          {n}
        </span>
        <Link
          href={href}
          className="font-mono text-2xs uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          deep dive →
        </Link>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <GridBg />
        {children}
      </div>

      <div className="relative z-[5] px-[18px] pb-[18px]">
        <span className="font-mono text-[22px] font-bold lowercase text-text-primary">
          {label}
        </span>
        <span className="mt-0.5 block font-body text-xs text-text-secondary">
          {sub}
        </span>
      </div>
    </div>
  );
}

export function Connector() {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center py-2 font-mono text-xl font-bold text-border-strong md:px-1"
    >
      <span className="md:hidden">↓</span>
      <span className="hidden md:inline">→</span>
    </div>
  );
}
