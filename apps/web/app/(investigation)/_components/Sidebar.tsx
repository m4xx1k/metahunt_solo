"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { RefreshButton } from "./RefreshButton";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  badge?: number;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "dashboard" }],
  },
  {
    label: "Pipeline",
    items: [{ href: "/sources", label: "sources" }],
  },
  {
    label: "Silver",
    items: [
      { href: "/vacancies", label: "vacancies", external: true },
      { href: "/taxonomy", label: "taxonomy" },
    ],
  },
];

const VERSION_LABEL = "v0.4 · dev";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function Sidebar({
  asOf,
  taxonomyQueueCount,
}: {
  asOf: Date;
  taxonomyQueueCount?: number;
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const closeMobile = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "close sidebar" : "open sidebar"}
        aria-expanded={open}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center border border-border bg-bg-card font-mono text-lg text-text-primary shadow-[3px_3px_0_0_#000] md:hidden"
      >
        {open ? "✕" : "☰"}
      </button>

      {open ? (
        <button
          type="button"
          aria-label="close sidebar"
          onClick={closeMobile}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "z-40 w-[240px] flex-shrink-0 flex-col border-r border-border bg-bg",
          "md:static md:flex",
          open
            ? "fixed inset-y-0 left-0 flex shadow-[8px_0_0_0_#000]"
            : "hidden md:flex",
        )}
      >
        <div className="flex flex-col gap-1 border-b border-border px-5 py-6">
          <Link
            href="/dashboard"
            aria-label="MetaHunt operator home"
            className="block"
            onClick={closeMobile}
          >
            <Logo label="metahunt" />
          </Link>
          <span className="pl-[44px] font-mono text-[11px] uppercase tracking-wider text-text-muted">
            operator
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-6 px-3 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <span className="px-3 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-text-muted">
                {group.label}
              </span>
              <ul className="flex flex-col gap-[2px]">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const badge =
                    item.href === "/taxonomy"
                      ? taxonomyQueueCount
                      : item.badge;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeMobile}
                        className={cn(
                          "flex items-center gap-2 border-l-2 px-3 py-2 font-mono text-sm transition-colors",
                          active
                            ? "border-accent bg-bg-elev text-accent"
                            : "border-transparent text-text-secondary hover:border-border hover:text-text-primary",
                        )}
                      >
                        <span className="text-text-muted">&gt;</span>
                        <span className="flex-1">{item.label}</span>
                        {item.external ? (
                          <span aria-hidden="true" className="text-text-muted">
                            ↗
                          </span>
                        ) : null}
                        {typeof badge === "number" && badge > 0 ? (
                          <span className="font-mono text-[11px] text-text-muted">
                            ⌄{badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-5">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            as of {formatTime(asOf)}
          </span>
          <RefreshButton />
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            {VERSION_LABEL}
          </span>
        </div>
      </aside>
    </>
  );
}
