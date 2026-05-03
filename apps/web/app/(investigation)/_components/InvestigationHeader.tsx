import Link from "next/link";
import { Logo } from "@/components/ui-kit";
import { RefreshButton } from "./RefreshButton";

export function InvestigationHeader({
  title,
  breadcrumbs,
}: {
  title: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}) {
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between md:px-20">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="MetaHunt home">
            <Logo />
          </Link>
          <span className="hidden h-6 w-px bg-border md:block" />
          <nav className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            <Link href="/monitoring" className="hover:text-accent">
              monitoring
            </Link>
            {breadcrumbs?.map((b, i) => (
              <span key={i} className="flex items-center gap-2">
                <span>/</span>
                {b.href ? (
                  <Link href={b.href} className="hover:text-accent">
                    {b.label}
                  </Link>
                ) : (
                  <span className="text-text-secondary">{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between gap-4 md:justify-end">
          <h1 className="font-display text-xl font-bold text-text-primary md:text-2xl">
            {title}
          </h1>
          <RefreshButton />
        </div>
      </div>
    </header>
  );
}
