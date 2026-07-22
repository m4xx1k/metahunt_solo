"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Logo } from "@/ui";
import { cn } from "@/lib/utils";
import { pad2 } from "@/lib/format";
import { useSession } from "@/features/auth/use-session";
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
    label: "огляд",
    items: [
      { href: "/dashboard", label: "дашборд" },
      { href: "/product-analytics", label: "продуктова аналітика" },
      { href: "/dashboard/extraction", label: "витрати на екстракцію" },
    ],
  },
  {
    label: "пайплайн",
    items: [{ href: "/sources", label: "джерела" }],
  },
  {
    label: "вакансії",
    items: [
      { href: "/vacancies", label: "silver", external: true },
      { href: "/unique-vacancies", label: "gold (унікальні)" },
      { href: "/taxonomy", label: "довідник понять" },
    ],
  },
];

const VERSION_LABEL = "v0.4 · dev";

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

function formatTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const MOBILE_NAV_ID = "investigation-mobile-nav";

export function Sidebar({ asOf, taxonomyQueueCount }: { asOf: Date; taxonomyQueueCount?: number }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const closeMobile = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMobile();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Full-width fixed mobile top bar — persistent, so the toggle stays
          reachable even while the panel below it is open. Unlike the old
          lone floating burger square, the layout reserves its height via
          `pt-14` on the content column, so it never sits on top of a page's
          own heading. */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-bg px-4 md:hidden">
        <Link
          href="/dashboard"
          aria-label="MetaHunt — головна оператора"
          className="block"
          onClick={closeMobile}
        >
          <Logo className="gap-2" label="metahunt" />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "закрити меню" : "відкрити меню"}
          aria-expanded={open}
          aria-controls={MOBILE_NAV_ID}
          className="flex h-10 w-10 items-center justify-center border border-border bg-bg-card font-mono text-lg text-text-primary shadow-brut-sm"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Mobile: a full-width dropdown panel below the bar (not a partial
          slide-in + backdrop) — nothing left to dim, so no separate scrim.
          Desktop: the regular static column, unchanged. */}
      <aside
        id={MOBILE_NAV_ID}
        className={cn(
          "flex-shrink-0 flex-col bg-bg",
          "md:static md:z-auto md:flex md:w-[240px] md:border-r md:border-border",
          open
            ? "fixed inset-x-0 top-14 bottom-0 z-40 flex overflow-y-auto border-t border-border"
            : "hidden md:flex",
        )}
      >
        <div className="hidden border-b border-border px-5 py-6 md:flex md:flex-col md:gap-1">
          <Link
            href="/dashboard"
            aria-label="MetaHunt — головна оператора"
            className="block"
            onClick={closeMobile}
          >
            <Logo label="metahunt" />
          </Link>
          <span className="pl-[44px] font-mono text-2xs uppercase tracking-wider text-text-muted">
            оператор
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-6 px-3 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
              <span className="px-3 font-mono text-2xs font-bold uppercase tracking-[0.15em] text-text-muted">
                {group.label}
              </span>
              <ul className="flex flex-col gap-[2px]">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const badge = item.href === "/taxonomy" ? taxonomyQueueCount : item.badge;
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
                          <span className="font-mono text-2xs text-text-muted">⌄{badge}</span>
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
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            станом на {formatTime(asOf)}
          </span>
          <RefreshButton />
          <div className="flex flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
              {user?.username ? `@${user.username}` : "оператор"}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void logout();
                router.replace("/");
              }}
            >
              вийти
            </Button>
          </div>
          <span className="font-mono text-2xs uppercase tracking-wider text-text-muted">
            {VERSION_LABEL}
          </span>
        </div>
      </aside>
    </>
  );
}
