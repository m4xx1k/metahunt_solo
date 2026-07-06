"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/ui";
import { TelegramLoginButton } from "./telegram-login-button";
import { useSession } from "./use-session";

// Header entry point: a popover anchored to the trigger. Logged out → "log in ▾"
// opening the value prop + Telegram button; logged in → "@username ▾" opening
// my-saved + log-out. Hand-rolled dropdown (no shared Popover primitive) with
// click-outside + Escape, house neo-brutalist chrome.
export function AccountMenu() {
  const { user, isLoggedIn, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = isLoggedIn
    ? user?.username
      ? `@${user.username}`
      : user?.firstName ?? "account"
    : "log in";

  return (
    <div ref={ref} className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} <span aria-hidden>▾</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 animate-overlay-in border border-border bg-bg-card p-4 shadow-brut"
        >
          {isLoggedIn ? (
            <div className="flex flex-col gap-1">
              <Link
                href="/me"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="px-3 py-2 font-mono text-2xs uppercase tracking-wider text-text-secondary hover:bg-bg-elev hover:text-text-primary"
              >
                my saved
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void logout();
                  setOpen(false);
                }}
                className="px-3 py-2 text-left font-mono text-2xs uppercase tracking-wider text-text-secondary hover:bg-bg-elev hover:text-danger"
              >
                log out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-mono text-2xs uppercase leading-relaxed tracking-wider text-text-secondary">
                save your feed + get telegram alerts
              </p>
              <TelegramLoginButton onDone={() => setOpen(false)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
