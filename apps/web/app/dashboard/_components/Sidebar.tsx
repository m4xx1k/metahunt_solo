"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { pad2 } from "@/lib/format";
import { useSession } from "@/features/auth/use-session";
import { RefreshButton } from "./RefreshButton";
import { isNavItemActive, NAV_GROUPS } from "./nav";

const MOBILE_NAV_ID = "console-nav";

function formatClock(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function Sidebar({ asOf }: { asOf: Date }) {
  const pathname = usePathname() ?? "/dashboard";
  const router = useRouter();
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-bg px-4 md:hidden">
        <Brand onNavigate={close} />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={MOBILE_NAV_ID}
          className="flex size-9 items-center justify-center border border-border text-text-primary"
        >
          {open ? (
            <X aria-hidden="true" className="size-4" />
          ) : (
            <Menu aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>

      <aside
        id={MOBILE_NAV_ID}
        className={cn(
          "flex-shrink-0 flex-col bg-bg",
          // Desktop: its own scroll container pinned to the viewport, so nav
          // stays reachable no matter how long the screen's body is.
          "md:sticky md:top-0 md:z-auto md:flex md:h-screen md:w-[232px] md:overflow-y-auto md:border-r md:border-border",
          open
            ? "fixed inset-x-0 bottom-0 top-14 z-40 flex overflow-y-auto border-t border-border"
            : "hidden md:flex",
        )}
      >
        <div className="hidden border-b border-border px-5 py-5 md:block">
          <Brand onNavigate={close} />
        </div>

        <nav className="flex flex-1 flex-col gap-5 px-3 py-5">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label ?? `group-${index}`} className="flex flex-col gap-1.5">
              {group.label ? (
                <span className="px-3 font-mono text-2xs uppercase tracking-[0.18em] text-text-muted">
                  {group.label}
                </span>
              ) : null}
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 border-l-2 px-3 py-2 font-mono text-sm transition-colors",
                          active
                            ? "border-accent bg-bg-elev text-text-primary"
                            : "border-transparent text-text-secondary hover:bg-bg-card hover:text-text-primary",
                        )}
                      >
                        <Icon
                          aria-hidden="true"
                          className={cn("size-4 shrink-0", active && "text-accent")}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-2xs uppercase tracking-[0.12em] text-text-muted">
              synced {formatClock(asOf)}
            </span>
            <RefreshButton label="sync" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-xs text-text-secondary">
              {user?.username ? `@${user.username}` : "operator"}
            </span>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => {
                void logout();
                router.replace("/");
              }}
              className="flex size-7 items-center justify-center border border-border text-text-muted transition-colors hover:border-danger hover:text-danger"
            >
              <LogOut aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Brand({ onNavigate }: { onNavigate: () => void }) {
  return (
    <Link
      href="/dashboard"
      onClick={onNavigate}
      className="flex items-center gap-2.5"
      aria-label="metahunt console"
    >
      <Image src="/logo.webp" alt="" width={24} height={24} className="rounded-full" />
      <span className="font-display text-sm font-bold tracking-tight text-text-primary">
        metahunt
        <span className="pl-1.5 font-normal text-text-muted">console</span>
      </span>
    </Link>
  );
}
